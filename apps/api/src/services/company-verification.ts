import type { CompanyVerification } from "@pitchperfect/shared";
import { disposableEmailBlocklist } from "disposable-email-domains-js";
import emailProviders from "email-providers";
import { getDomain } from "tldts";
import { ALIAS_MAIL_DOMAINS } from "./alias-mail-domains.js";

let freeMailDomains: Set<string> | undefined;

/**
 * Domains where anyone can get an address, so they prove nothing about a company: the free mail
 * providers from `email-providers`, the throwaway ones from `disposable-email-domains-js`, and the
 * alias and forwarding services in `ALIAS_MAIL_DOMAINS`, all lowercase. Loaded on first use.
 */
function freeMailDomainList(): Set<string> {
  freeMailDomains ??= new Set([
    ...emailProviders,
    ...disposableEmailBlocklist(),
    ...ALIAS_MAIL_DOMAINS,
  ]);
  return freeMailDomains;
}

/**
 * Registrable domain ("acme-demo.co.uk" for "www.acme-demo.co.uk"), using the public suffix list
 * including private suffixes, so "acme.github.io" is its own domain rather than "github.io".
 * Null for IP addresses, bare suffixes, and anything unparsable.
 */
export const registrableDomain = (hostOrUrl: string): string | null =>
  getDomain(hostOrUrl.trim().toLowerCase(), { allowPrivateDomains: true });

/**
 * True when the email domain, or any parent of it down to its registrable domain, is a free,
 * disposable or alias mail domain: "mail.yahoo.co.uk" is caught by "yahoo.co.uk".
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
 * A company is verified when the employer's confirmed email shares a registrable domain with the
 * company website. Free-mail, disposable and alias addresses never verify.
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

/**
 * The domain a company's badge vouches for: the one recorded at verification, or for a company
 * verified before domains were recorded, its website's registrable domain (a domain move drops the
 * badge, so the two agree). Null unless the company is verified.
 */
export function badgeDomain(company: {
  verification: CompanyVerification;
  verifiedDomain?: string | null;
  website: string;
}): string | null {
  if (company.verification !== "verified") return null;
  return company.verifiedDomain ?? registrableDomain(company.website);
}
