import type { PublicCompany, PublicJob } from "@pitchperfect/shared";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { WRAP } from "@/components/marketing/Section";
import { SafeHtml } from "@/components/ui/SafeHtml";
import { cn } from "@/lib/cn";
import { EMPLOYMENT_TYPE_LABELS, formatPostedDate, WORKPLACE_LABELS } from "@/lib/job-labels";
import { CompanyBadge } from "./CompanyBadge";
import { PayText } from "./PayText";

/**
 * `page`: full-width bands on the public site (navy header, white body, soft-blue company band).
 * `panel`: the same content in rounded panels, for app pages.
 */
type Variant = "page" | "panel";

const SHELL: Record<
  Variant,
  { header: string; headerInner: string; title: string; band: string; body: string; soft: string }
> = {
  page: {
    header: "pp-on-dark bg-navy text-white",
    headerInner: cn(WRAP, "pt-8 pb-14 md:pt-12 md:pb-20"),
    title: "text-title text-white",
    band: cn(WRAP, "py-16 md:py-24"),
    body: "bg-surface",
    soft: "bg-primary-soft",
  },
  panel: {
    header: "rounded-card bg-surface ring-1 ring-border",
    headerInner: "p-6 md:p-8",
    title: "text-h2 text-navy",
    band: "py-8 md:px-8",
    body: "",
    soft: "rounded-card bg-primary-soft",
  },
};

const LINK_REL = "noopener noreferrer nofollow";

/** Only absolute https URLs are ever linked; anything else is left out. */
function httpsHref(value: string | null): string | null {
  if (!value || !URL.canParse(value)) return null;
  return new URL(value).protocol === "https:" ? value : null;
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      rel={LINK_REL}
      target="_blank"
      className="pp-link inline-flex items-center gap-1 rounded-control font-semibold text-primary"
    >
      {children}
      <ArrowUpRight aria-hidden="true" className="size-4" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function CompanyNote({ company }: { company: PublicCompany }) {
  if (company.verification === "verified") {
    return (
      <p>
        Verified means the employer confirmed a work email on the company&apos;s own website domain.
        It tells you who posted the job. It isn&apos;t a recommendation.
      </p>
    );
  }
  return (
    <p>
      {company.name} hasn&apos;t confirmed an email on its website&apos;s domain yet, so we
      don&apos;t know for sure who posted this. Look the company up yourself before you share
      anything beyond your application.
    </p>
  );
}

interface JobDetailsProps {
  job: PublicJob;
  company: PublicCompany;
  /** Apply, save, edit: whatever the page lets this viewer do. Sits under the pay. */
  actions?: ReactNode;
  /** A link back to the list this job came from. */
  back?: { href: string; label: string };
  variant?: Variant;
}

/** One job, as students, employers and visitors all see it. The description goes through SafeHtml. */
export function JobDetails({ job, company, actions, back, variant = "panel" }: JobDetailsProps) {
  const shell = SHELL[variant];
  const website = httpsHref(company.website);
  const linkedin = httpsHref(company.linkedinUrl);
  const facts: [string, string][] = [
    ["Location", job.location],
    ["Workplace", WORKPLACE_LABELS[job.workplace]],
    ["Job type", EMPLOYMENT_TYPE_LABELS[job.employmentType]],
  ];

  return (
    <article aria-labelledby="job-title">
      <header className={shell.header}>
        <div className={shell.headerInner}>
          {back && (
            <Link
              href={back.href}
              className="pp-link inline-flex items-center gap-1.5 rounded-control py-2 text-small font-semibold"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              {back.label}
            </Link>
          )}
          <div className="mt-6 grid gap-y-10 md:mt-10 lg:grid-cols-12 lg:gap-x-6">
            <div className="lg:col-span-8">
              <h1 id="job-title" className={cn("max-w-[20ch]", shell.title)}>
                {job.title}
              </h1>
              <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-lede font-semibold">
                {company.name}
                <CompanyBadge verification={company.verification} onDark={variant === "page"} />
              </p>
            </div>
            <div className="self-end lg:col-span-4 lg:col-start-9">
              <p className="font-display text-statement font-semibold">
                <PayText pay={job.pay} />
              </p>
              {actions && <div className="mt-6">{actions}</div>}
            </div>
          </div>
        </div>
      </header>

      <div className={shell.body}>
        <div className={cn(shell.band, "grid gap-y-12 lg:grid-cols-12 lg:gap-x-6")}>
          <section aria-labelledby="job-description-heading" className="min-w-0 lg:col-span-7">
            <h2 id="job-description-heading" className="sr-only">
              About the role
            </h2>
            <SafeHtml html={job.descriptionHtml} className="text-lede" />
          </section>
          <aside aria-label="Job facts" className="lg:col-span-4 lg:col-start-9">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-1">
              {facts.map(([term, value]) => (
                <div key={term}>
                  <dt className="text-small text-muted">{term}</dt>
                  <dd className="font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            {job.skills.length > 0 && (
              <>
                <h2
                  id="job-skills-heading"
                  className="mt-8 font-sans text-small font-normal text-muted"
                >
                  Skills they&apos;re hiring for
                </h2>
                <ul aria-label="Skills" className="mt-2 flex flex-wrap gap-2">
                  {job.skills.map((skill) => (
                    <li
                      key={skill}
                      className="rounded-pill bg-primary-soft px-3 py-1 text-small font-semibold text-ink"
                    >
                      {skill}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {job.publishedAt && (
              <p className="mt-8 text-small text-muted">
                Posted <time dateTime={job.publishedAt}>{formatPostedDate(job.publishedAt)}</time>
              </p>
            )}
          </aside>
        </div>
      </div>

      <section aria-labelledby="job-company-heading" className={shell.soft}>
        <div className={cn(shell.band, "grid gap-y-8 lg:grid-cols-12 lg:gap-x-6")}>
          <h2
            id="job-company-heading"
            className="max-w-[16ch] text-section text-navy lg:col-span-5"
          >
            About {company.name}
          </h2>
          <div className="flex flex-col gap-6 text-ink lg:col-span-6 lg:col-start-7">
            {company.pitch && <p className="text-statement">{company.pitch}</p>}
            <div className="flex flex-col items-start gap-3">
              <CompanyBadge verification={company.verification} />
              <div className="max-w-[56ch]">
                <CompanyNote company={company} />
              </div>
            </div>
            {(website ?? linkedin) && (
              <ul className="flex flex-wrap gap-x-8 gap-y-3">
                {website && (
                  <li>
                    <ExternalLink href={website}>Website</ExternalLink>
                  </li>
                )}
                {linkedin && (
                  <li>
                    <ExternalLink href={linkedin}>LinkedIn</ExternalLink>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </section>
    </article>
  );
}
