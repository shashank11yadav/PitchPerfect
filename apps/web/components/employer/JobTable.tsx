"use client";

import { JOB_STATUSES, type EmployerJobSummary, type JobStatus } from "@pitchperfect/shared";
import { Briefcase, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { LoadError, Loading } from "@/components/ui/LoadState";
import { Pagination } from "@/components/ui/Pagination";
import { EmployerJobsPage } from "@/lib/employer-api";
import { EMPLOYMENT_TYPE_LABELS, WORKPLACE_LABELS } from "@/lib/job-labels";
import { formatLocalDate } from "@/lib/local-time";
import { useApi } from "@/lib/use-api";

const TAB_LABELS: Record<JobStatus, string> = {
  draft: "Drafts",
  active: "Active",
  archived: "Archived",
};

const NONE_HERE: Record<JobStatus, string> = {
  draft: "No drafts. A new job stays a draft until you publish it.",
  active: "Nothing on the job board right now. Publish a draft, or reactivate an archived job.",
  archived: "Nothing archived. Archive a job when the role is filled; its open applications close.",
};

const TEXT_LINK = "pp-link rounded-control font-semibold text-primary";

/** How many of the company's jobs have each status (pages of one, for their totals). */
function useStatusCounts() {
  const draft = useApi("/employer/jobs?status=draft&pageSize=1", EmployerJobsPage);
  const active = useApi("/employer/jobs?status=active&pageSize=1", EmployerJobsPage);
  const archived = useApi("/employer/jobs?status=archived&pageSize=1", EmployerJobsPage);
  const all = { draft, active, archived };
  const reload = () => {
    for (const status of JOB_STATUSES) all[status].reload();
  };
  const failed = JOB_STATUSES.some((status) => all[status].state === "error");
  const counts =
    draft.state === "ready" && active.state === "ready" && archived.state === "ready"
      ? { draft: draft.data.total, active: active.data.total, archived: archived.data.total }
      : null;
  return { counts, failed, reload };
}

const COLUMNS: Column<EmployerJobSummary>[] = [
  {
    key: "job",
    header: "Job",
    cell: (job) => (
      <div className="flex flex-col gap-0.5">
        <Link href={`/employer/jobs/${job.id}`} className={`${TEXT_LINK} self-start text-body`}>
          {job.title}
        </Link>
        <span className="text-muted">
          {job.location} · {WORKPLACE_LABELS[job.workplace]} ·{" "}
          {EMPLOYMENT_TYPE_LABELS[job.employmentType]}
        </span>
      </div>
    ),
  },
  {
    key: "applicants",
    header: "Applicants",
    className: "whitespace-nowrap",
    cell: (job) =>
      job.applicantCount > 0 ? (
        <Link href={`/employer/jobs/${job.id}/applicants`} className={TEXT_LINK}>
          {job.applicantCount === 1 ? "1 applicant" : `${String(job.applicantCount)} applicants`}
        </Link>
      ) : (
        <span className="text-muted">None yet</span>
      ),
  },
  {
    key: "date",
    header: "Date",
    className: "hidden whitespace-nowrap sm:table-cell",
    cell: (job) =>
      job.publishedAt ? (
        <>
          Posted <time dateTime={job.publishedAt}>{formatLocalDate(job.publishedAt)}</time>
        </>
      ) : (
        <>
          Created <time dateTime={job.createdAt}>{formatLocalDate(job.createdAt)}</time>
        </>
      ),
  },
];

function JobList({ status }: { status: JobStatus }) {
  const [page, setPage] = useState(1);
  const list = useApi(`/employer/jobs?status=${status}&page=${String(page)}`, EmployerJobsPage);
  if (list.state === "loading") return <Loading label="Loading jobs" lines={4} />;
  if (list.state === "error") return <LoadError what="your jobs" onRetry={list.reload} />;
  if (list.data.total === 0) return <p className="text-ink">{NONE_HERE[status]}</p>;
  return (
    <div className="flex flex-col gap-5">
      <DataTable
        caption={`${TAB_LABELS[status]} jobs`}
        columns={COLUMNS}
        rows={list.data.items}
        rowKey={(job) => job.id}
      />
      <Pagination
        page={list.data.page}
        pageSize={list.data.pageSize}
        total={list.data.total}
        onPageChange={setPage}
      />
    </div>
  );
}

const postLink = (
  <Link href="/employer/jobs/new" className={buttonClasses()}>
    <Plus aria-hidden="true" className="size-4" />
    Post a job
  </Link>
);

/** The company's jobs by status, with how many people applied to each. */
export function JobTable({ initialStatus = "active" }: { initialStatus?: JobStatus }) {
  const [status, setStatus] = useState<JobStatus>(initialStatus);
  const { counts, failed, reload } = useStatusCounts();

  if (failed) return <LoadError what="your jobs" onRetry={reload} />;
  if (counts && counts.draft + counts.active + counts.archived === 0) {
    return (
      <EmptyState
        icon={<Briefcase className="size-6" />}
        title="Post your first job"
        description="Write the role, the pay and what a normal week looks like. Save it as a draft until it reads right, then publish it to the job board."
        action={postLink}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <FilterTabs
          label="Job status"
          value={status}
          onChange={setStatus}
          options={(["active", "draft", "archived"] as const).map((value) => ({
            value,
            label: TAB_LABELS[value],
            count: counts?.[value],
          }))}
        />
        {postLink}
      </div>
      <JobList key={status} status={status} />
    </div>
  );
}
