import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  json,
  jobSummary,
  publicCompany,
  publicJob,
  unverifiedListing,
} from "@/components/jobs/test-fixtures";
import JobPage, { generateMetadata } from "./[slug]/page";
import JobsPage, { metadata as jobsMetadata } from "./page";

const NOT_FOUND = new Error("NEXT_NOT_FOUND");
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
  usePathname: () => "/jobs",
}));

const fetchMock = vi.fn<typeof fetch>();
const API = "http://api.test:4000";

/** Answers server calls by path; browser calls (the apply island) see a signed-out visitor. */
function serve(routes: Record<string, () => Response>) {
  fetchMock.mockImplementation((input) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (!url.startsWith(API)) {
      return Promise.resolve(json({ error: { code: "unauthorized", message: "No" } }, 401));
    }
    const route = routes[url.slice(API.length)];
    if (!route) return Promise.reject(new Error(`unexpected request ${url}`));
    return Promise.resolve(route());
  });
}

const page = (items = [jobSummary()], total = items.length, pageNumber = 1) => ({
  items,
  page: pageNumber,
  pageSize: 20,
  total,
});

const apiError = (status: number) =>
  json({ error: { code: status === 404 ? "not_found" : "internal_error", message: "x" } }, status);

const renderJobs = async (searchParams: Record<string, string | string[]> = {}) =>
  render(await JobsPage({ searchParams: Promise.resolve(searchParams) }));

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("API_ORIGIN", API);
  vi.stubEnv("PROXY_SHARED_SECRET", "");
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("/jobs", () => {
  it("has the board's own metadata", () => {
    expect(jobsMetadata.alternates?.canonical).toMatch(/\/jobs$/);
    expect(jobsMetadata.robots).toBeUndefined();
  });

  it("renders the first page of listings with a GET search form that needs no script", async () => {
    serve({ "/api/jobs?page=1&pageSize=20": () => json(page()) });
    await renderJobs();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/jobs");
    expect(within(form).getByLabelText("Search")).toHaveAttribute("name", "q");
    expect(within(form).getByLabelText("Workplace")).toHaveAttribute("name", "workplace");
    expect(within(form).getByLabelText("Job type")).toHaveAttribute("name", "employmentType");
    const link = screen.getByRole("link", { name: "Sales development representative" });
    expect(link).toHaveAttribute("href", "/jobs/sales-development-representative-a1b2c3");
    expect(screen.getByText("$52,000–$60,000 per year + commission")).toBeInTheDocument();
  });

  it("passes the submitted query to the api and keeps it in the form", async () => {
    serve({
      "/api/jobs?q=discovery&workplace=remote&employmentType=internship&page=2&pageSize=20": () =>
        json(page([jobSummary()], 21, 2)),
    });
    await renderJobs({
      q: "  discovery ",
      workplace: "remote",
      employmentType: "internship",
      page: "2",
      utm_source: "newsletter",
    });
    expect(screen.getByLabelText("Search")).toHaveValue("discovery");
    expect(screen.getByLabelText("Workplace")).toHaveValue("remote");
    expect(screen.getByLabelText("Job type")).toHaveValue("internship");
    const previous = screen.getByRole("link", { name: "Previous page" });
    expect(previous).toHaveAttribute(
      "href",
      "/jobs?q=discovery&workplace=remote&employmentType=internship",
    );
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/jobs");
  });

  it("ignores filter values the api wouldn't accept", async () => {
    serve({ "/api/jobs?page=1&pageSize=20": () => json(page()) });
    await renderJobs({ workplace: "moon", employmentType: "", page: "-3", q: "" });
    expect(fetchMock).toHaveBeenCalledWith(`${API}/api/jobs?page=1&pageSize=20`, expect.anything());
  });

  it("marks listings from unverified employers, and names the domain of verified ones", async () => {
    const { job } = unverifiedListing();
    serve({ "/api/jobs?page=1&pageSize=20": () => json(page([jobSummary(), job])) });
    await renderJobs();
    const [verifiedRow, unverifiedRow] = screen.getAllByRole("article");
    if (!verifiedRow || !unverifiedRow) throw new Error("expected two listings");
    expect(within(verifiedRow).queryByText("Unverified employer")).toBeNull();
    expect(
      within(verifiedRow).getByText("Verified · quarrow-logistics.example"),
    ).toBeInTheDocument();
    expect(within(unverifiedRow).getByText("Unverified employer")).toBeInTheDocument();
    expect(within(unverifiedRow).queryByText(/^Verified/)).toBeNull();
  });

  it("says when nothing matches and how to widen the search", async () => {
    serve({ "/api/jobs?q=astronaut&page=1&pageSize=20": () => json(page([], 0)) });
    await renderJobs({ q: "astronaut" });
    expect(screen.getByRole("heading", { name: /no jobs match/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Show every job" })).toHaveAttribute("href", "/jobs");
  });

  it("says plainly when the board is empty", async () => {
    serve({ "/api/jobs?page=1&pageSize=20": () => json(page([], 0)) });
    await renderJobs();
    expect(screen.getByRole("heading", { name: /no jobs are listed/i })).toBeInTheDocument();
  });

  it("shows a calm error state when the api is down", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await renderJobs({ q: "sdr" });
    expect(screen.getByRole("heading", { name: /couldn.t load the jobs/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/jobs?q=sdr");
    expect(screen.getByRole("search")).toBeInTheDocument();
  });
});

describe("/jobs/[slug]", () => {
  const verified = { job: publicJob(), company: publicCompany() };
  const SLUG = verified.job.slug;

  it("titles a verified job after the role and company, with a plain-text description", async () => {
    serve({ [`/api/jobs/${SLUG}`]: () => json(verified) });
    const metadata = await generateMetadata(params(SLUG));
    expect(metadata.title).toBe("Sales development representative at Quarrow Logistics Software");
    expect(metadata.description).not.toMatch(/[<>]/);
    expect(metadata.description).toContain("Start conversations with freight operators.");
    expect(metadata.description?.length).toBeLessThanOrEqual(155);
    expect(metadata.alternates?.canonical).toMatch(new RegExp(`/jobs/${SLUG}$`));
    expect(metadata.robots).toBeUndefined();
  });

  it("adds JobPosting structured data for a verified company", async () => {
    serve({ [`/api/jobs/${SLUG}`]: () => json(verified) });
    const { container } = render(await JobPage(params(SLUG)));
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const data = JSON.parse(script?.textContent ?? "{}") as Record<string, unknown>;
    expect(data["@type"]).toBe("JobPosting");
    expect(data.title).toBe("Sales development representative");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(verified.job.title);
  });

  it("keeps an unverified company's job out of search: noindex and no JSON-LD", async () => {
    const unverified = unverifiedListing();
    const slug = unverified.job.slug;
    serve({ [`/api/jobs/${slug}`]: () => json(unverified) });
    const metadata = await generateMetadata(params(slug));
    expect(metadata.robots).toEqual({ index: false, follow: false });
    const { container } = render(await JobPage(params(slug)));
    expect(container.querySelector('script[type="application/ld+json"]')).toBeNull();
    expect(screen.getAllByText("Unverified employer").length).toBeGreaterThan(0);
  });

  it("is a 404 when the api says the job isn't listed", async () => {
    serve({ "/api/jobs/gone-123": () => apiError(404) });
    await expect(JobPage(params("gone-123"))).rejects.toBe(NOT_FOUND);
    const metadata = await generateMetadata(params("gone-123"));
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("is a 404 without asking the api when the slug can't be one", async () => {
    serve({});
    await expect(JobPage(params("Not A Slug!"))).rejects.toBe(NOT_FOUND);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an error state, not a 404, when the api fails", async () => {
    serve({ [`/api/jobs/${SLUG}`]: () => apiError(503) });
    render(await JobPage(params(SLUG)));
    expect(screen.getByRole("heading", { name: /couldn.t load this job/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      `/jobs/${SLUG}`,
    );
    const metadata = await generateMetadata(params(SLUG));
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
