import type { CompanyVerification } from "@pitchperfect/shared";
import { BadgeCheck, CircleAlert, Ban, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** "pitchwell-demo.example" from "https://www.pitchwell-demo.example/about". */
export function domainOf(website: string): string {
  return URL.canParse(website)
    ? new URL(website).hostname.replace(/^www\./, "")
    : "your-company.example";
}

const LOOK: Record<CompanyVerification, { icon: LucideIcon; frame: string; tint: string }> = {
  verified: { icon: BadgeCheck, frame: "border-success/40 bg-success/10", tint: "text-success" },
  unverified: { icon: CircleAlert, frame: "border-warning/50 bg-warning/10", tint: "text-ink" },
  suspended: { icon: Ban, frame: "border-danger/40 bg-danger/10", tint: "text-danger" },
};

interface VerificationBannerProps {
  verification: CompanyVerification;
  /** The company's website, to show which email domain verifies it. */
  website: string;
  /** `sample` from the api: the website is on a reserved domain, so students see a sample. */
  sample?: boolean;
  className?: string;
}

/** What students see of a sample company, said in place of what its badge would show. */
const SAMPLE_VIEW =
  "Your website is on a domain reserved for examples, so students see your company labeled “Sample company”, with no links, and your jobs stay out of search engines.";

/**
 * Where the company stands and why, in plain words: what students see on its jobs (a sample
 * company's as a sample), and for an unverified company, how it gets verified (matching email
 * domain, or an admin's approval).
 */
export function VerificationBanner({
  verification,
  website,
  sample = false,
  className,
}: VerificationBannerProps) {
  const domain = domainOf(website);
  const copy: Record<CompanyVerification, { title: string; body: ReactNode }> = {
    verified: {
      title: "Verified",
      body: sample
        ? `${SAMPLE_VIEW} Being verified still lets you send interview invites.`
        : "Students see a “Verified” badge with your domain on your jobs, so they know the posting comes from someone with an email there.",
    },
    unverified: {
      title: "Not verified yet",
      body: (
        <>
          {sample
            ? SAMPLE_VIEW
            : "Your jobs show an “Unverified employer” badge and stay out of search engines until the company is verified."}{" "}
          Confirming an email on your website’s domain, like{" "}
          <span className="font-semibold [overflow-wrap:anywhere]">you@{domain}</span>, verifies the
          company on its own. Otherwise, or after you change the company’s name or website domain,
          an admin checks the company and approves it by hand.
        </>
      ),
    },
    suspended: {
      title: "Suspended",
      body: "An admin suspended this company. Your jobs are hidden from students and the job board, and until the suspension is lifted you can’t see applicants or their résumés, send interview invites, post or edit jobs, or edit the company. Your account settings still work.",
    },
  };
  const { icon: Icon, frame, tint } = LOOK[verification];
  const { title, body } = copy[verification];
  return (
    <section
      aria-labelledby="verification-heading"
      className={cn("flex gap-3 rounded-card border p-5", frame, className)}
    >
      <Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", tint)} />
      <div>
        <h2 id="verification-heading" className="font-sans text-body font-bold text-ink">
          {title}
        </h2>
        <p className="mt-1 max-w-[66ch] text-ink">{body}</p>
      </div>
    </section>
  );
}
