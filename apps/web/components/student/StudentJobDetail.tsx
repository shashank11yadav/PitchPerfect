"use client";

import { PublicJobDetailResponseSchema } from "@pitchperfect/shared";
import { Mic } from "lucide-react";
import Link from "next/link";
import { ApplyActions } from "@/components/jobs/ApplyActions";
import { JobDetails } from "@/components/jobs/JobDetails";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadError, Loading } from "@/components/ui/LoadState";
import { ApiError } from "@/lib/api";
import { practiceHref } from "@/lib/practice/paths";
import { useApi } from "@/lib/use-api";

/** One job inside the app: the shared job view, with apply and save. */
export function StudentJobDetail({ slug }: { slug: string }) {
  const job = useApi(`/jobs/${encodeURIComponent(slug)}`, PublicJobDetailResponseSchema);

  if (job.state === "loading") return <Loading label="Loading the job" lines={6} />;
  if (job.state === "error") {
    if (job.error instanceof ApiError && job.error.status === 404) {
      return (
        <EmptyState
          title="This job isn’t listed anymore"
          description="The employer may have filled it or taken it down. If you applied, it’s still in your applications."
          action={
            <Link href="/app/jobs" className={buttonClasses()}>
              See open jobs
            </Link>
          }
        />
      );
    }
    return <LoadError what="this job" onRetry={job.reload} />;
  }

  const { job: listing, company } = job.data;
  return (
    <JobDetails
      job={listing}
      company={company}
      titleAs="h2"
      back={{ href: "/app/jobs", label: "All jobs" }}
      actions={
        <div className="flex flex-col gap-5">
          <ApplyActions jobId={listing.id} slug={listing.slug} />
          <Link
            href={practiceHref("pitching", listing.id)}
            className="pp-link inline-flex items-center gap-1.5 self-start rounded-control font-semibold text-primary"
          >
            <Mic aria-hidden="true" className="size-4" />
            Practice for this job
          </Link>
        </div>
      }
    />
  );
}
