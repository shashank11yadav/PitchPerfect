import type { CompanyVerification } from "@pitchperfect/shared";
import { getDomain } from "tldts";

/** Anyone can get an address at these, so they prove nothing about a company. */
const FREE_MAIL_DOMAINS = new Set([
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
]);

/**
 * Registrable domain ("acme-demo.co.uk" for "www.acme-demo.co.uk"), using the public suffix list
 * including private suffixes, so "acme.github.io" is its own domain rather than "github.io".
 * Null for IP addresses, bare suffixes, and anything unparsable.
 */
const registrableDomain = (hostOrUrl: string): string | null =>
  getDomain(hostOrUrl.trim().toLowerCase(), { allowPrivateDomains: true });

/**
 * A company is verified at sign-up when the employer's email shares a registrable domain with the
 * company website. Free-mail addresses never verify.
 */
export function verificationForCompany(
  emailDomain: string,
  website: string,
): Extract<CompanyVerification, "verified" | "unverified"> {
  const fromEmail = registrableDomain(emailDomain);
  const fromWebsite = registrableDomain(website);
  if (fromEmail === null || fromWebsite === null) return "unverified";
  if (FREE_MAIL_DOMAINS.has(fromEmail)) return "unverified";
  return fromEmail === fromWebsite ? "verified" : "unverified";
}
