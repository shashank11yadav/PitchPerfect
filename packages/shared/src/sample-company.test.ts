import { describe, expect, it } from "vitest";
import { isSampleWebsite } from "./sample-company.js";
import { SEED_COMPANIES } from "./seed-data.js";

describe("isSampleWebsite", () => {
  it.each([
    "https://zentrova-analytics.example",
    "https://www.quarrow-logistics.example/about",
    "https://acme.test",
    "https://shop.example.com",
    "https://example.org",
    "https://demo.invalid",
    "http://localhost:3000",
    "orvexa-payments.example",
    "https://ACME.EXAMPLE.",
  ])("takes %s for a sample", (website) => {
    expect(isSampleWebsite(website)).toBe(true);
  });

  it.each([
    "https://quarrow.com",
    "https://www.example-freight.com",
    "https://examples.org",
    "https://acme.testing.io",
    "acme.co.uk",
    "",
    "not a website",
  ])("takes %s for a real website", (website) => {
    expect(isSampleWebsite(website)).toBe(false);
  });

  it("covers every seeded company", () => {
    expect(SEED_COMPANIES.every((company) => isSampleWebsite(company.host))).toBe(true);
  });
});
