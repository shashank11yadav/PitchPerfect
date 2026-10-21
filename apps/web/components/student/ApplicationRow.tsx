"use client";

import type { ApplicationClosedReason, StudentApplicationView } from "@pitchperfect/shared";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { InterviewSlot } from "@/components/jobs/InterviewSlot";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { apiFetch } from "@/lib/api";
import { formatLocalDate } from "@/lib/local-time";
import { attemptPath } from "@/lib/practice/paths";
import { OneApplication } from "@/lib/student-api";
import { StatusPill } from "./StatusPill";

/** Students can withdraw while an application is still open. */
const WITHDRAWABLE = new Set(["applied", "shortlisted", "interview"]);

const CLOSED_BECAUSE: Record<ApplicationClosedReason, string> = {
  employer_left: "The employer left PitchPerfect, so this application was closed.",
  job_archived: "This job was archived, so the application was closed.",
};

interface ApplicationRowProps {
  application: StudentApplicationView;
  onChange: (application: StudentApplicationView) => void;
}

/** One application: the job as it was when the student applied, its status, and what's next. */
export function ApplicationRow({ application, onChange }: ApplicationRowProps) {
  const { job, status, interview, closedReason } = application;
  const [confirming, setConfirming] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  /** Set by a withdrawal here, so focus follows it to the new status and not to the page. */
  const withdrew = useRef(false);

  useEffect(() => {
    if (status !== "withdrawn" || !withdrew.current) return;
    withdrew.current = false;
    statusRef.current?.focus();
  }, [status]);

  async function withdraw() {
    const updated = await apiFetch(`/applications/${application.id}/withdraw`, {
      method: "POST",
      schema: OneApplication,
    });
    withdrew.current = true;
    onChange(updated);
  }

  return (
    <li className="grid gap-4 py-6 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:gap-x-8">
      <div className="min-w-0">
        <h2 className="text-h4">
          {job.slug ? (
            <Link href={`/app/jobs/${job.slug}`} className="pp-link rounded-control">
              {job.title}
            </Link>
          ) : (
            job.title
          )}
        </h2>
        <p className="mt-1 text-ink">
          <span>{job.companyName}</span>
          <span className="text-muted">
            {" · "}Applied{" "}
            <time dateTime={application.appliedAt}>{formatLocalDate(application.appliedAt)}</time>
          </span>
        </p>
        {!job.slug && status !== "closed" && (
          <p className="mt-2 text-small text-muted">This job is no longer listed.</p>
        )}
        {status === "closed" && closedReason && (
          <p className="mt-3 text-ink">{CLOSED_BECAUSE[closedReason]}</p>
        )}
        {status === "interview" && interview && (
          <InterviewSlot interview={interview} linkLabel="Join the interview" className="mt-4" />
        )}
        {/* The same flag the employer sees: the shared session still exists and was completed. */}
        {application.sharedAttemptId && application.hasSharedScorecard && (
          <p className="mt-3 text-small text-muted">
            You shared{" "}
            <Link
              href={attemptPath(application.sharedAttemptId)}
              className="pp-link rounded-control font-semibold text-primary"
            >
              a practice scorecard
            </Link>{" "}
            with this application.
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-start">
        <div ref={statusRef} tabIndex={-1} className="rounded-pill">
          <span className="sr-only">Status: </span>
          <StatusPill status={status} />
        </div>
        {WITHDRAWABLE.has(status) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setConfirming(true);
            }}
          >
            Withdraw<span className="sr-only"> your application for {job.title}</span>
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => {
          setConfirming(false);
        }}
        title="Withdraw this application?"
        description={
          <>
            {job.companyName} will see that you withdrew from {job.title}. You can&apos;t apply to
            this job again afterwards.
          </>
        }
        confirmLabel="Withdraw application"
        cancelLabel="Keep it"
        onConfirm={withdraw}
      />
    </li>
  );
}
