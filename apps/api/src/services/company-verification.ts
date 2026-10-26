import type { CompanyVerification } from "@pitchperfect/shared";
import { disposableEmailBlocklist } from "disposable-email-domains-js";
import emailProviders from "email-providers";
import { getDomain } from "tldts";

let freeMailDomains: Set<string> | undefined;

/**
 * Domains where anyone can get an address, so they prove nothing about a company: the free mail
 * providers from `email-providers` and the throwaway ones from `disposable-email-domains-js`, both
 * lowercase. Loaded on first use.
 */
function freeMailDomainList(): Set<string> {
  freeMailDomains ??= new Set([...emailProviders, ...disposableEmailBlocklist()]);
  return freeMailDomains;
}

/**
 * Registrable domain ("acme-demo.co.uk" for "www.acme-demo.co.uk"), using the public suffix list
 * including private suffixes, so "acme.github.io" is its own domain rather than "github.io".
 * Null for IP addresses, bare suffixes, and anything unparsable.
 */
const registrableDomain = (hostOrUrl: string): string | null =>
  getDomain(hostOrUrl.trim().toLowerCase(), { allowPrivateDomains: true });

/**
 * True when the email domain, or any parent of it down to its registrable domain, is a free or
 * disposable mail domain: "mail.yahoo.co.uk" is caught by "yahoo.co.uk".
 */
function isFreeMail(emailDomain: string, registrable: string): boolean {
  const labels = emailDomain.trim().toLowerCase().replace(/\.$/, "").split(".");
  const list = freeMailDomainList();
  for (let start = 0; start < labels.length; start += 1) {
    const candidate = labels.slice(start).join(".");
    if (list.has(candidate)) return true;
    if (candidate === registrable) break;
  }
  return false;
}

/** True when both point at the same registrable domain (both parse to one). */
export function sameCompanyDomain(a: string, b: string): boolean {
  const domain = registrableDomain(a);
  return domain !== null && domain === registrableDomain(b);
}

/**
 * A company is verified at sign-up when the employer's email shares a registrable domain with the
 * company website. Free-mail and disposable addresses never verify.
 */
export function verificationForCompany(
  emailDomain: string,
  website: string,
): Extract<CompanyVerification, "verified" | "unverified"> {
  const fromEmail = registrableDomain(emailDomain);
  const fromWebsite = registrableDomain(website);
  if (fromEmail === null || fromWebsite === null) return "unverified";
  if (isFreeMail(emailDomain, fromEmail)) return "unverified";
  return fromEmail === fromWebsite ? "verified" : "unverified";
}
