"use client";

import type { EmployerJob, JobStatus, PublicCompany, PublicJob } from "@pitchperfect/shared";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { JobDetails } from "@/components/jobs/JobDetails";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadError, Loading } from "@/components/ui/LoadState";
import { Tabs } from "@/components/ui/Tabs";
import { ApiError, apiFetch } from "@/lib/api";
import { EMPLOYER_API_MESSAGES, OneCompany, OneJob } from "@/lib/employer-api";
import { JOB_STATUS_LABELS } from "@/lib/job-labels";
import { formatLocalDate } from "@/lib/local-time";
import { useApi } from "@/lib/use-api";
import { formMessage } from "@/lib/use-form";
import { JobForm, type JobContent, type JobIntent } from "./JobForm";

const TEXT_LINK =
  "pp-link inline-flex items-center gap-1.5 rounded-control font-semibold text-primary";

const STATUS_TONES = { draft: "neutral", active: "success", archived: "neutral" } as const;

/** A job's status as a badge, beside its title. */
export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{JOB_STATUS_LABELS[status]}</Badge>;
}

/** The owner's job as the public listing shows it, for the preview. */
function asListing(job: EmployerJob, company: PublicCompany): PublicJob {
  return {
    id: job.id,
    slug: job.slug,
    title: job.title,
    location: job.location,
    workplace: job.workplace,
    employmentType: job.employmentType,
    pay: job.pay,
    skills: job.skills,
    publishedAt: job.publishedAt,
    descriptionHtml: job.descriptionHtml,
    company: {
      name: company.name,
      slug: company.slug,
      logoUrl: company.logoUrl,
      verification: company.verification,
      verifiedDomain: company.verifiedDomain,
      sample: company.sample,
    },
  };
}

type Pending = "archive" | "delete" | null;

interface StatusActionsProps {
  job: EmployerJob;
  onChange: (job: EmployerJob, news: ReactNode) => void;
}

/** Archive, reactivate and delete, each only where the api allows it, with the reason when not. */
function StatusActions({ job, onChange }: StatusActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const deletable = job.applicantCount === 0;
  const isDraft = job.status === "draft";

  async function changeStatus(status: JobStatus) {
    return apiFetch(`/employer/jobs/${encodeURIComponent(job.id)}/status`, {
      method: "POST",
      body: { status },
      schema: OneJob,
    });
  }

  async function reactivate() {
    setBusy(true);
    setProblem("");
    try {
      onChange(await changeStatus("active"), "Reactivated. It’s back on the job board.");
    } catch (error) {
      setProblem(formMessage(error, EMPLOYER_API_MESSAGES));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {job.status === "active" && (
          <Button
            variant="secondary"
            onClick={() => {
              setPending("archive");
            }}
          >
            Archive
          </Button>
        )}
        {job.status === "archived" && (
          <Button variant="secondary" loading={busy} onClick={() => void reactivate()}>
            Reactivate
          </Button>
        )}
        {deletable && (
          <Button
            variant="danger-ghost"
            onClick={() => {
              setPending("delete");
            }}
          >
            {isDraft ? "Delete draft" : "Delete job"}
          </Button>
        )}
      </div>
      {!deletable && (
        <p className="max-w-prose text-small text-muted">
          A job can’t be deleted once someone has applied, so their application history stays
          intact. Archive it instead.
        </p>
      )}
      <p role="alert" className="text-danger empty:sr-only">
        {problem}
      </p>
      <ConfirmDialog
        open={pending === "archive"}
        onClose={() => {
          setPending(null);
        }}
        title="Archive this job?"
        description="It comes off the job board. Every open application is closed, and each of those applicants gets an email saying applications have closed. Reactivating it later won’t reopen them."
        confirmLabel="Archive job"
        cancelLabel="Keep it open"
        apiMessages={EMPLOYER_API_MESSAGES}
        onConfirm={async () => {
          onChange(
            await changeStatus("archived"),
            "Archived. It’s off the job board, and its open applications are closed.",
          );
        }}
      />
      <ConfirmDialog
        open={pending === "delete"}
        onClose={() => {
          setPending(null);
        }}
        title={isDraft ? "Delete this draft?" : "Delete this job?"}
        description={
          isDraft
            ? "It was never published, so no student has seen it. This can’t be undone."
            : "Nobody has applied, so nothing else is affected. This can’t be undone."
        }
        confirmLabel={isDraft ? "Delete draft" : "Delete job"}
        cancelLabel="Keep it"
        apiMessages={EMPLOYER_API_MESSAGES}
        onConfirm={async () => {
          await apiFetch(`/employer/jobs/${encodeURIComponent(job.id)}`, { method: "DELETE" });
          router.push("/employer/jobs");
        }}
      />
    </div>
  );
}

const CREATED_NEWS = {
  published: "Published. It’s on the job board now.",
  draft: "Draft saved. Publish it when it reads right.",
} as const;

type CreatedAs = keyof typeof CREATED_NEWS;

/** A job id that names nothing this company owns (or nothing at all). */
export function JobNotFound() {
  return (
    <EmptyState
      title="This job isn’t here"
      description="It may have been deleted, or the link is wrong."
      action={
        <Link href="/employer/jobs" className={buttonClasses()}>
          Back to your jobs
        </Link>
      }
    />
  );
}

/** A job that didn't load: gone (or another company's), or a retry. */
export function JobLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof ApiError && error.status === 404) return <JobNotFound />;
  return <LoadError what="this job" onRetry={onRetry} />;
}

interface JobEditorProps {
  id: string;
  /** Set when the job was created a moment ago, to say how it was saved. */
  created?: CreatedAs | undefined;
}

/** One of the employer's jobs: edit it, preview it as students see it, and change its status. */
export function JobEditor({ id, created }: JobEditorProps) {
  const jobPath = `/employer/jobs/${encodeURIComponent(id)}`;
  const job = useApi(jobPath, OneJob);
  const company = useApi("/employer/company", OneCompany);
  const [news, setNews] = useState<ReactNode>(created ? CREATED_NEWS[created] : null);

  // The note is for this visit only; a reload or a shared link shouldn't repeat it.
  useEffect(() => {
    if (!created) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("created");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [created]);

  if (job.state === "loading") return <Loading label="Loading the job" lines={6} />;
  if (job.state === "error") {
    return <JobLoadError error={job.error} onRetry={job.reload} />;
  }

  const current = job.data;
  const changed = (updated: EmployerJob, message: ReactNode) => {
    job.update(() => updated);
    setNews(message);
  };

  async function save(content: JobContent, intent: JobIntent) {
    setNews(null);
    let updated = await apiFetch(jobPath, {
      method: "PATCH",
      body: content,
      schema: OneJob,
    });
    job.update(() => updated);
    if (intent === "publish") {
      updated = await apiFetch(`${jobPath}/status`, {
        method: "POST",
        body: { status: "active" },
        schema: OneJob,
      });
      changed(updated, CREATED_NEWS.published);
      return;
    }
    setNews(updated.status === "draft" ? "Draft saved." : "Changes saved.");
  }

  const preview =
    company.state === "ready" ? (
      <div className="flex flex-col gap-4">
        <p className="text-small text-muted">The last saved version, as students see it.</p>
        <JobDetails job={asListing(current, company.data)} company={company.data} titleAs="h3" />
      </div>
    ) : company.state === "error" ? (
      <LoadError what="the preview" onRetry={company.reload} />
    ) : (
      <Loading label="Loading the preview" />
    );

  return (
    <div className="flex flex-col gap-6">
      <Link href="/employer/jobs" className={`${TEXT_LINK} self-start py-1 text-small`}>
        <ArrowLeft aria-hidden="true" className="size-4" />
        All jobs
      </Link>
      <Card className="flex flex-col gap-5 md:p-8">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-h2 [overflow-wrap:anywhere]">{current.title}</h2>
            <JobStatusBadge status={current.status} />
          </div>
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-ink">
            {current.publishedAt ? (
              <span>
                Posted{" "}
                <time dateTime={current.publishedAt}>{formatLocalDate(current.publishedAt)}</time>
              </span>
            ) : (
              <span>Not published yet</span>
            )}
            {current.status !== "draft" &&
              (current.applicantCount > 0 ? (
                <Link href={`/employer/jobs/${current.id}/applicants`} className={TEXT_LINK}>
                  {current.applicantCount === 1
                    ? "1 applicant"
                    : `${String(current.applicantCount)} applicants`}
                </Link>
              ) : (
                <span className="text-muted">No applicants yet</span>
              ))}
            {current.status === "active" && (
              <Link href={`/jobs/${current.slug}`} className={TEXT_LINK}>
                See it on the job board
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </Link>
            )}
          </p>
          <p role="status" className="font-semibold text-success empty:sr-only">
            {news}
          </p>
        </div>
        <StatusActions job={current} onChange={changed} />
      </Card>
      <Tabs
        label="Job"
        tabs={[
          {
            id: "edit",
            label: "Edit",
            content: (
              <Card className="md:p-8">
                <JobForm initial={current} onSubmit={save} />
              </Card>
            ),
          },
          { id: "preview", label: "Preview", content: preview },
        ]}
      />
    </div>
  );
}
