import type { PublicCompany, PublicJob } from "@pitchperfect/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Seo = typeof import("./seo");
let seo: Seo;

beforeEach(async () => {
  vi.stubEnv("SITE_URL", "https://example.test/");
  vi.resetModules();
  seo = await import("./seo");
  return () => {
    vi.unstubAllEnvs();
  };
});

const description =
  "Practice sales conversations with an AI practice partner, get a scorecard that quotes your words, and apply to entry-level sales roles with confidence.";

describe("pageMetadata", () => {
  it("builds the title, canonical URL, Open Graph and Twitter card from SITE_URL", () => {
    const metadata = seo.pageMetadata({ title: "For students", description, path: "/students" });
    expect(metadata.title).toBe("For students");
    expect(metadata.description).toBe(description);
    expect(metadata.alternates?.canonical).toBe("https://example.test/students");
    expect(metadata.openGraph).toMatchObject({
      url: "https://example.test/students",
      title: "For students · PitchPerfect",
      description,
      siteName: "PitchPerfect",
      type: "website",
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "For students · PitchPerfect",
      description,
    });
    expect(metadata.robots).toBeUndefined();
  });

  it("points Open Graph and Twitter at the generated share image", () => {
    const metadata = seo.pageMetadata({ title: "About", description, path: "/about" });
    const image = {
      url: "/opengraph-image",
      width: 1200,
      height: 630,
      alt: "PitchPerfect: Practice your pitch. Get hired.",
    };
    expect(metadata.openGraph?.images).toEqual([image]);
    expect(metadata.twitter?.images).toEqual([image]);
  });

  it("uses the bare origin as the home page's canonical URL", () => {
    const metadata = seo.pageMetadata({ title: "Home", description, path: "/" });
    expect(metadata.alternates?.canonical).toBe("https://example.test/");
  });

  it("asks search engines not to index or follow a noindex page", () => {
    const metadata = seo.pageMetadata({ title: "Jobs", description, path: "/app", noindex: true });
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});

describe("site JSON-LD", () => {
  it("describes the organization and the website", () => {
    expect(seo.organizationJsonLd()).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "PitchPerfect",
      url: "https://example.test/",
      logo: "https://example.test/icons/icon-512.png",
    });
    expect(seo.websiteJsonLd()).toMatchObject({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "PitchPerfect",
      url: "https://example.test/",
    });
  });

  it("turns FAQ items into an FAQPage", () => {
    expect(seo.faqJsonLd([{ question: "Is it free?", answer: "Yes." }])).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Is it free?",
          acceptedAnswer: { "@type": "Answer", text: "Yes." },
        },
      ],
    });
  });
});

describe("jobPostingJsonLd", () => {
  const company: PublicCompany = {
    id: "65f1c0ffee0000000000c0de",
    name: "Quarrow Logistics Software",
    slug: "quarrow-logistics-software",
    website: "https://quarrow.example",
    linkedinUrl: null,
    pitch: "Routing software for regional carriers.",
    logoUrl: "https://quarrow.example/logo.png",
    verification: "verified",
  };
  const job = (overrides: Partial<PublicJob> = {}): PublicJob => ({
    id: "65f1c0ffee0000000000abcd",
    slug: "sales-development-rep-x1",
    title: "Sales development representative",
    location: "Columbus, OH",
    workplace: "onsite",
    employmentType: "full_time",
    pay: {
      type: "range",
      min: 52000,
      max: 60000,
      currency: "USD",
      frequency: "annually",
      commission: true,
    },
    skills: ["Prospecting"],
    publishedAt: "2026-10-01T12:00:00.000Z",
    descriptionHtml: "<p>Book first meetings.</p>",
    company: {
      name: company.name,
      slug: company.slug,
      logoUrl: company.logoUrl,
      verification: company.verification,
    },
    ...overrides,
  });

  it("maps an onsite full-time job with a pay range", () => {
    const data = seo.jobPostingJsonLd(job(), company);
    expect(data).toMatchObject({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Sales development representative",
      description: "<p>Book first meetings.</p>",
      datePosted: "2026-10-01T12:00:00.000Z",
      employmentType: "FULL_TIME",
      url: "https://example.test/jobs/sales-development-rep-x1",
      hiringOrganization: {
        "@type": "Organization",
        name: "Quarrow Logistics Software",
        sameAs: "https://quarrow.example",
        logo: "https://quarrow.example/logo.png",
      },
      jobLocation: {
        "@type": "Place",
        address: { "@type": "PostalAddress", addressLocality: "Columbus, OH" },
      },
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "USD",
        value: { "@type": "QuantitativeValue", minValue: 52000, maxValue: 60000, unitText: "YEAR" },
      },
    });
    expect(data).not.toHaveProperty("validThrough");
    expect(data).not.toHaveProperty("jobLocationType");
  });

  it("marks remote jobs as telecommute and includes validThrough when the job closes", () => {
    const data = seo.jobPostingJsonLd(
      {
        ...job({ workplace: "remote", location: "United States" }),
        closesAt: "2026-12-01T00:00:00.000Z",
      },
      company,
    );
    expect(data).toMatchObject({
      jobLocationType: "TELECOMMUTE",
      applicantLocationRequirements: { "@type": "Country", name: "US" },
      validThrough: "2026-12-01T00:00:00.000Z",
    });
    expect(data).not.toHaveProperty("jobLocation");
  });

  it.each(["US", "USA", "Remote (US)", "Anywhere in the United States", "U.S. only"])(
    "reads %j as the US for a remote job's applicant location",
    (location) => {
      const data = seo.jobPostingJsonLd(job({ workplace: "remote", location }), company);
      expect(data).toMatchObject({
        applicantLocationRequirements: { "@type": "Country", name: "US" },
      });
    },
  );

  it("leaves applicantLocationRequirements out when the location names no country", () => {
    const data = seo.jobPostingJsonLd(job({ workplace: "remote", location: "Anywhere" }), company);
    expect(data).toMatchObject({ jobLocationType: "TELECOMMUTE" });
    expect(data).not.toHaveProperty("applicantLocationRequirements");
    expect(data).not.toHaveProperty("jobLocation");
  });

  it.each([
    ["internship", "INTERN"],
    ["full_time", "FULL_TIME"],
    ["part_time", "PART_TIME"],
    ["contract", "CONTRACTOR"],
  ] as const)("maps %s to %s", (employmentType, expected) => {
    expect(seo.jobPostingJsonLd(job({ employmentType }), company).employmentType).toBe(expected);
  });

  it("uses a single value for exact pay and omits salary for unpaid roles", () => {
    const exact = seo.jobPostingJsonLd(
      job({
        pay: { type: "exact", amount: 22, currency: "CAD", frequency: "hourly", commission: false },
      }),
      company,
    );
    expect(exact.baseSalary).toEqual({
      "@type": "MonetaryAmount",
      currency: "CAD",
      value: { "@type": "QuantitativeValue", value: 22, unitText: "HOUR" },
    });
    const unpaid = seo.jobPostingJsonLd(job({ pay: { type: "unpaid" } }), company);
    expect(unpaid).not.toHaveProperty("baseSalary");
  });

  it("leaves out a logo the company has not set", () => {
    const data = seo.jobPostingJsonLd(job(), { ...company, logoUrl: null });
    expect(data.hiringOrganization).not.toHaveProperty("logo");
  });
});

describe("PUBLIC_PAGES", () => {
  it("gives every public page a unique title and a 140–160 character description", () => {
    const pages = Object.values(seo.PUBLIC_PAGES);
    for (const page of pages) {
      expect(page.description.length, page.path).toBeGreaterThanOrEqual(140);
      expect(page.description.length, page.path).toBeLessThanOrEqual(160);
    }
    expect(new Set(pages.map((page) => page.title)).size).toBe(pages.length);
    expect(new Set(pages.map((page) => page.description)).size).toBe(pages.length);
  });
});
