import type {
  EmploymentType,
  JobPay,
  PayFrequency,
  PublicCompany,
  PublicJob,
} from "@pitchperfect/shared";
import type { Metadata } from "next";
import { PAGES_EXPORT } from "./pages-export";
import { SITE_NAME, SITE_URL, TAGLINE } from "./site";

interface PageSeo {
  /** The page's own title; the root layout's template adds " · PitchPerfect". */
  title: string;
  /** 140–160 characters, unique per page. */
  description: string;
  /** Path from the site root, e.g. `/students`. */
  path: string;
  noindex?: boolean;
}

/** A path that names a file, such as an icon, rather than a page. */
const FILE_PATH = /\.[a-z0-9]+$/i;

/**
 * Absolute URL of a page or file on the canonical origin. `SITE_URL` may carry a path (the GitHub
 * Pages demo lives under /PitchPerfect), and the static export serves every page with a trailing
 * slash.
 */
export function absoluteUrl(path: string): string {
  const base = new URL(`${SITE_URL}/`);
  const pathname = `${base.pathname.replace(/\/$/, "")}${path}`;
  const slash = PAGES_EXPORT && !pathname.endsWith("/") && !FILE_PATH.test(pathname);
  return new URL(slash ? `${pathname}/` : pathname, base).href;
}

/** The public pages, in sitemap order. Each page's metadata comes from its entry here. */
export const PUBLIC_PAGES = {
  home: {
    title: TAGLINE,
    path: "/",
    description:
      "Rehearse sales conversations out loud with an AI practice partner, get a scorecard that quotes your own words, and apply to entry-level sales roles.",
  },
  students: {
    title: "For students",
    path: "/students",
    description:
      "Practice introductions, pitches and objection handling with an AI practice partner, see exactly what to improve, and share your best scorecard with employers.",
  },
  employers: {
    title: "For employers",
    path: "/employers",
    description:
      "Post entry-level sales roles and meet applicants who have practiced real buyer conversations. Review résumés and shared scorecards, then book interviews.",
  },
  howItWorks: {
    title: "How it works",
    path: "/how-it-works",
    description:
      "Learn a skill, practice it with an AI practice partner that plays a realistic buyer, read a scorecard built from your own words, then apply for sales roles.",
  },
  jobs: {
    title: "Entry-level sales jobs",
    path: "/jobs",
    description:
      "Browse entry-level sales, business development and customer success roles. Practice for a specific job with an AI practice partner before you apply.",
  },
  about: {
    title: "About",
    path: "/about",
    description:
      "Why PitchPerfect exists: people starting out in sales should get their first fumbled calls out of the way in practice, with feedback that quotes what they said.",
  },
  privacy: {
    title: "Privacy policy",
    path: "/privacy",
    description:
      "How PitchPerfect handles accounts, résumés, practice transcripts and speech: what we collect, who processes it, how long we keep it, and how to delete it.",
  },
  terms: {
    title: "Terms of use",
    path: "/terms",
    description:
      "The rules for using PitchPerfect: accounts for people 18 and older, fair use of the AI practice partner, job postings, applications and account deletion.",
  },
} as const satisfies Record<string, PageSeo>;

/** Sign-in, sign-up and the emailed-link pages. All `noindex`; none are in the sitemap. */
export const AUTH_PAGES = {
  signin: {
    title: "Sign in",
    path: "/signin",
    description:
      "Sign in to PitchPerfect to practice sales conversations with the AI practice partner, read your scorecards, or review applicants for your open roles.",
  },
  signup: {
    title: "Sign up",
    path: "/signup",
    description:
      "Create a PitchPerfect account: students practice sales conversations and apply to entry-level jobs, employers post roles and meet applicants who have practiced.",
  },
  signupStudent: {
    title: "Sign up as a student",
    path: "/signup/student",
    description:
      "Create a free student account on PitchPerfect to practice sales conversations with an AI practice partner and apply to entry-level sales roles.",
  },
  signupEmployer: {
    title: "Sign up as an employer",
    path: "/signup/employer",
    description:
      "Create an employer account on PitchPerfect to post entry-level sales roles and review applicants who share scorecards from practice calls.",
  },
  verifyEmail: {
    title: "Confirm your email",
    path: "/verify-email",
    description:
      "Confirm the email address on your PitchPerfect account with the link we sent you, so you can practice, apply to jobs and post roles.",
  },
  forgotPassword: {
    title: "Reset your password",
    path: "/forgot-password",
    description:
      "Forgot your PitchPerfect password? Enter the email you signed up with and we will send you a link to choose a new one.",
  },
  resetPassword: {
    title: "Choose a new password",
    path: "/reset-password",
    description:
      "Choose a new password for your PitchPerfect account using the reset link from your email. Links work once and expire after a short time.",
  },
} as const satisfies Record<string, PageSeo>;

/** Metadata for an auth page: never indexed. */
export const authPageMetadata = (page: PageSeo): Metadata =>
  pageMetadata({ ...page, noindex: true });

/**
 * For pages opened from an emailed link with a token in the URL: no `Referer` leaves the page,
 * so the token can't reach another site even before the address bar is cleaned.
 */
export const tokenPageMetadata = (page: PageSeo): Metadata => ({
  ...authPageMetadata(page),
  referrer: "no-referrer",
});

/**
 * The share card from `app/opengraph-image.tsx`. Listed explicitly because a page's own
 * `openGraph` replaces the inherited one, image included.
 */
const SHARE_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: `${SITE_NAME}: ${TAGLINE}`,
};

/** Per-page metadata: title, description, canonical URL, Open Graph and Twitter card. */
export function pageMetadata({ title, description, path, noindex = false }: PageSeo): Metadata {
  const url = absoluteUrl(path);
  // Only `title` gets the layout's template; the social titles are spelled out in full.
  const fullTitle = `${title} · ${SITE_NAME}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      url,
      title: fullTitle,
      description,
      images: [SHARE_IMAGE],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [SHARE_IMAGE] },
    ...(noindex && { robots: { index: false, follow: false } }),
  };
}

const CONTEXT = "https://schema.org";

const ORGANIZATION_DESCRIPTION =
  "PitchPerfect is a practice and hiring platform for entry-level sales roles, with an AI practice partner and rubric-based scorecards.";

export function organizationJsonLd() {
  return {
    "@context": CONTEXT,
    "@type": "Organization",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/icons/icon-512.png"),
    description: ORGANIZATION_DESCRIPTION,
  };
}

export function websiteJsonLd() {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    description: ORGANIZATION_DESCRIPTION,
  };
}

export interface FaqItem {
  question: string;
  answer: string;
}

export function faqJsonLd(items: readonly FaqItem[]) {
  return {
    "@context": CONTEXT,
    "@type": "FAQPage",
    mainEntity: items.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}

const EMPLOYMENT_TYPE: Record<EmploymentType, string> = {
  internship: "INTERN",
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
};

const PAY_UNIT: Record<PayFrequency, string> = {
  hourly: "HOUR",
  weekly: "WEEK",
  monthly: "MONTH",
  annually: "YEAR",
};

function baseSalary(pay: JobPay) {
  if (pay.type === "unpaid") return undefined;
  const value =
    pay.type === "range"
      ? { "@type": "QuantitativeValue", minValue: pay.min, maxValue: pay.max }
      : { "@type": "QuantitativeValue", value: pay.amount };
  return {
    "@type": "MonetaryAmount",
    currency: pay.currency,
    value: { ...value, unitText: PAY_UNIT[pay.frequency] },
  };
}

/** A job that may carry a closing date. */
type PostedJob = PublicJob & { closesAt?: string | null };

/** "US", "USA", "U.S.", "United States (of America)": the one country the job board serves. */
const UNITED_STATES = /\b(?:USA?|U\.S\.(?:A\.?)?|United States(?: of America)?)(?![A-Za-z])/;

/**
 * The ISO country code a remote job's free-text location names, if any. `applicantLocationRequirements`
 * must be a real country, so a location that names none is left out rather than guessed.
 */
const applicantCountryOf = (location: string): string | undefined =>
  UNITED_STATES.test(location) ? "US" : undefined;

/** `JobPosting` for a job page. Only call it for jobs of verified companies. */
export function jobPostingJsonLd(job: PostedJob, company: PublicCompany) {
  const salary = baseSalary(job.pay);
  const country = job.workplace === "remote" ? applicantCountryOf(job.location) : undefined;
  const location =
    job.workplace === "remote"
      ? {
          jobLocationType: "TELECOMMUTE",
          ...(country && { applicantLocationRequirements: { "@type": "Country", name: country } }),
        }
      : {
          jobLocation: {
            "@type": "Place",
            address: { "@type": "PostalAddress", addressLocality: job.location },
          },
        };
  return {
    "@context": CONTEXT,
    "@type": "JobPosting",
    title: job.title,
    description: job.descriptionHtml,
    url: absoluteUrl(`/jobs/${job.slug}`),
    ...(job.publishedAt && { datePosted: job.publishedAt }),
    ...(job.closesAt && { validThrough: job.closesAt }),
    employmentType: EMPLOYMENT_TYPE[job.employmentType],
    hiringOrganization: {
      "@type": "Organization",
      name: company.name,
      sameAs: company.website,
      ...(company.logoUrl && { logo: company.logoUrl }),
    },
    ...location,
    ...(salary && { baseSalary: salary }),
  };
}
