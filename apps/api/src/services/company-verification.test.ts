import { describe, expect, it } from "vitest";
import { verificationForCompany } from "./company-verification.js";

describe("verificationForCompany", () => {
  it.each([
    ["acme-demo.com", "https://www.acme-demo.com"],
    ["acme-demo.com", "https://acme-demo.com/about"],
    ["acme-demo.com", "https://x.acme-demo.com"],
    ["mail.acme-demo.com", "https://www.acme-demo.com"],
    ["ACME-demo.com", "https://www.Acme-Demo.com"],
    ["acme-demo.co.uk", "https://acme-demo.co.uk"],
    // A company on the same country domain as a blocked provider still verifies.
    ["careers.acme-demo.de", "https://www.acme-demo.de"],
  ])("verifies %s against %s", (emailDomain, website) => {
    expect(verificationForCompany(emailDomain, website)).toBe("verified");
  });

  it.each([
    ["gmail.com", "https://www.acme-demo.com"],
    ["other-demo.com", "https://www.acme-demo.com"],
    // Same name, different registrable domain under a public suffix.
    ["acme-demo.co.uk", "https://acme-demo.com"],
    ["demo.co.uk", "https://acme-demo.co.uk"],
    // A public suffix is not a company domain.
    ["co.uk", "https://co.uk"],
    // A hosted subdomain on a shared platform belongs to the platform, not the company.
    ["github.io", "https://acme-demo.github.io"],
    ["acme-demo.com", "not a url"],
    ["acme-demo.com", "https://192.0.2.10"],
  ])("does not verify %s against %s", (emailDomain, website) => {
    expect(verificationForCompany(emailDomain, website)).toBe("unverified");
  });

  it.each([
    ["yahoo.co.uk", "https://www.yahoo.co.uk"],
    ["gmx.de", "https://www.gmx.de"],
    ["web.de", "https://web.de"],
    ["mail.ru", "https://mail.ru"],
    ["hotmail.co.uk", "https://hotmail.co.uk"],
    ["libero.it", "https://libero.it"],
    ["mailinator.com", "https://www.mailinator.com"],
    // Case and subdomains don't get around the list.
    ["GMX.DE", "https://www.gmx.de"],
    ["mail.yahoo.co.uk", "https://yahoo.co.uk"],
  ])("never verifies the free or disposable mail domain %s", (emailDomain, website) => {
    expect(verificationForCompany(emailDomain, website)).toBe("unverified");
  });

  it.each([
    "gmail.com",
    "googlemail.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "yahoo.com",
    "icloud.com",
    "me.com",
    "proton.me",
    "protonmail.com",
    "aol.com",
    "gmx.com",
    "mail.com",
    "zoho.com",
    "yandex.com",
  ])("never verifies the free-mail domain %s, even against its own website", (domain) => {
    expect(verificationForCompany(domain, `https://www.${domain}`)).toBe("unverified");
  });
});
