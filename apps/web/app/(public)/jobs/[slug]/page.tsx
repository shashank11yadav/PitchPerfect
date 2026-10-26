import {
  PublicJobDetailResponseSchema,
  type PublicCompany,
  type PublicJob,
} from "@pitchperfect/shared";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ApplyActions } from "@/components/jobs/ApplyActions";
import { JobDetails } from "@/components/jobs/JobDetails";
import { CtaBand } from "@/components/marketing/CtaBand";
import { PageHero } from "@/components/marketing/Hero";
import { buttonClasses } from "@/components/ui/Button";
import { JsonLd } from "@/components/ui/JsonLd";
import { ApiError } from "@/lib/api";
import { DEMO_JOBS, findDemoJob } from "@/lib/demo/jobs";
import { exportOnly, PAGES_EXPORT } from "@/lib/pages-export";
import { practiceHref } from "@/lib/practice/paths";
import { htmlToText, truncateText } from "@/lib/plain-text";
import { jobPostingJsonLd, pageMetadata } from "@/lib/seo";
import { serverApi } from "@/lib/server-api";

/** Job slugs are lowercase words and a suffix joined by hyphens (the api's `slugify`). */
const SLUG = /^[a-z0-9-]{1,100}$/;
const DESCRIPTION_MAX = 155;

type Loaded =
  | { kind: "found"; job: PublicJob; company: PublicCompany }
  | { kind: "missing" }
  | { kind: "failed" };

/** The static demo pre-renders every listed job. */
export const generateStaticParams = exportOnly(() =>
  DEMO_JOBS.map(({ job }) => ({ slug: job.slug })),
);

/** One api call per request, shared by the metadata and the page. The static demo has it baked. */
const loadJob = cache(async (slug: string): Promise<Loaded> => {
  if (!SLUG.test(slug)) return { kind: "missing" };
  if (PAGES_EXPORT) {
    const found = findDemoJob(slug);
    return found ? { kind: "found", ...found } : { kind: "missing" };
  }
  try {
    const { job, company } = await serverApi(`/api/jobs/${slug}`, PublicJobDetailResponseSchema);
    return { kind: "found", job, company };
  } catch (error) {
    // Only the api's own "not listed" is a 404; anything else is an outage, not a missing job.
    return error instanceof ApiError && error.status === 404
      ? { kind: "missing" }
      : { kind: "failed" };
  }
});

interface JobPageProps {
  params: Promise<{ slug: string }>;
}

const HIDDEN = { index: false, follow: false };

export async function generateMetadata({ params }: JobPageProps): Promise<Metadata> {
  const loaded = await loadJob((await params).slug);
  if (loaded.kind === "missing") return { title: "Job not found", robots: HIDDEN };
  if (loaded.kind === "failed") return { title: "Job unavailable", robots: HIDDEN };

  const { job, company } = loaded;
  const summary = `${company.name} is hiring: ${job.title}, ${job.location}. ${htmlToText(job.descriptionHtml)}`;
  return pageMetadata({
    title: `${job.title} at ${company.name}`,
    description: truncateText(summary, DESCRIPTION_MAX),
    path: `/jobs/${job.slug}`,
    // Unverified employers stay out of search until they prove who they are.
    noindex: company.verification !== "verified",
  });
}

export default async function JobPage({ params }: JobPageProps) {
  const { slug } = await params;
  const loaded = await loadJob(slug);
  if (loaded.kind === "missing") notFound();

  if (loaded.kind === "failed") {
    return (
      <PageHero
        title="We couldn’t load this job"
        lead={
          <p>
            The job board isn&apos;t answering right now. The listing is probably still there; try
            again in a minute.
          </p>
        }
        actions={
          <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
            <Link
              href={`/jobs/${slug}`}
              className={buttonClasses({ variant: "inverse", size: "lg" })}
            >
              Try again
            </Link>
            <Link href="/jobs" className="pp-link rounded-control py-2 font-semibold text-white">
              All jobs
            </Link>
          </div>
        }
      />
    );
  }

  const { job, company } = loaded;
  return (
    <>
      {company.verification === "verified" && <JsonLd data={jobPostingJsonLd(job, company)} />}
      <JobDetails
        variant="page"
        job={job}
        company={company}
        back={{ href: "/jobs", label: "All jobs" }}
        actions={
          PAGES_EXPORT ? (
            <DemoJobActions jobId={job.id} />
          ) : (
            <ApplyActions jobId={job.id} slug={job.slug} dark />
          )
        }
      />
      <CtaBand
        title="Rehearse the call before you apply"
        body="Practice with a partner who plays the buyer, read a scorecard that quotes what you said, and go into the interview having done it once."
        secondary={{ href: "/how-it-works", label: "How practice works" }}
      />
    </>
  );
}

/**
 * In the static demo nobody can apply, so the job's own action is the one the demo can do: a
 * practice call set up around it. The sign-in route explains the rest.
 */
function DemoJobActions({ jobId }: { jobId: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
      <Link
        href={practiceHref(undefined, jobId)}
        className={buttonClasses({ variant: "inverse", size: "lg" })}
      >
        Practice for this job
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
      <Link href="/signin" className="pp-link rounded-control py-2 font-semibold text-white">
        Sign in to apply
      </Link>
    </div>
  );
}
