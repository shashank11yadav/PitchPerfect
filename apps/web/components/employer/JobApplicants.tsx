"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Loading } from "@/components/ui/LoadState";
import { OneJob } from "@/lib/employer-api";
import { useApi } from "@/lib/use-api";
import { ApplicantTable } from "./ApplicantTable";
import { JobLoadError, JobStatusBadge } from "./JobEditor";

const TEXT_LINK =
  "pp-link inline-flex items-center gap-1.5 self-start rounded-control py-1 text-small font-semibold text-primary";

/**
 * The applicants page: which job this is, then its applicant pipeline. With an applicant open, the
 * pipeline swaps this header for a breadcrumb back to the job and the list.
 */
export function JobApplicants({ id, initialId }: { id: string; initialId?: string | undefined }) {
  const job = useApi(`/employer/jobs/${encodeURIComponent(id)}`, OneJob);

  if (job.state === "loading") return <Loading label="Loading the job" lines={4} />;
  if (job.state === "error") return <JobLoadError error={job.error} onRetry={job.reload} />;

  const { title, status } = job.data;
  const jobHref = `/employer/jobs/${encodeURIComponent(id)}`;
  return (
    <ApplicantTable
      jobId={id}
      jobTitle={title}
      jobHref={jobHref}
      initialId={initialId}
      header={
        <>
          <Link href={jobHref} className={TEXT_LINK}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to the job
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-h2 [overflow-wrap:anywhere]">{title}</h2>
            <JobStatusBadge status={status} />
          </div>
        </>
      }
    />
  );
}
