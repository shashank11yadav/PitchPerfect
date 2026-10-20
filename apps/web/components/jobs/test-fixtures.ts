import type { PublicCompany, PublicJob, PublicJobSummary } from "@pitchperfect/shared";

/** Fictional listings for tests; the companies come from the seed's coined names. */
export function jobSummary(overrides: Partial<PublicJobSummary> = {}): PublicJobSummary {
  return {
    id: "65f1c0ffee0000000000abcd",
    slug: "sales-development-representative-a1b2c3",
    title: "Sales development representative",
    location: "Boston, MA",
    workplace: "hybrid",
    employmentType: "full_time",
    pay: {
      type: "range",
      min: 52_000,
      max: 60_000,
      currency: "USD",
      frequency: "annually",
      commission: true,
    },
    skills: ["Cold outreach", "Discovery questions"],
    publishedAt: "2026-10-12T15:00:00.000Z",
    company: {
      name: "Quarrow Logistics Software",
      slug: "quarrow-logistics-software",
      logoUrl: null,
      verification: "verified",
    },
    ...overrides,
  };
}

export function publicJob(overrides: Partial<PublicJob> = {}): PublicJob {
  return {
    ...jobSummary(),
    descriptionHtml:
      "<p>Start conversations with freight operators.</p><ul><li>Book first calls</li></ul>",
    ...overrides,
  };
}

export function publicCompany(overrides: Partial<PublicCompany> = {}): PublicCompany {
  return {
    id: "65f1c0ffee0000000000beef",
    name: "Quarrow Logistics Software",
    slug: "quarrow-logistics-software",
    website: "https://quarrow-logistics.example",
    linkedinUrl: "https://www.linkedin.com/company/quarrow-logistics-example",
    pitch: "Route planning and proof-of-delivery software for regional freight carriers.",
    logoUrl: null,
    verification: "verified",
    ...overrides,
  };
}

/** The same listing from Orvexa Payments, which hasn't verified its domain. */
export function unverifiedListing() {
  const company = publicCompany({
    id: "65f1c0ffee0000000000cafe",
    name: "Orvexa Payments",
    slug: "orvexa-payments",
    website: "https://orvexa-payments.example",
    linkedinUrl: null,
    pitch: "Simple card and invoice payments for freelancers and very small shops.",
    verification: "unverified",
  });
  const job = publicJob({
    slug: "inside-sales-associate-d4e5f6",
    title: "Inside sales associate",
    company: { name: company.name, slug: company.slug, logoUrl: null, verification: "unverified" },
  });
  return { job, company };
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
