"use client";

import type { ApplicationStatus, StudentApplicationView } from "@pitchperfect/shared";
import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { LoadError, Loading } from "@/components/ui/LoadState";
import { apiFetch } from "@/lib/api";
import { ApplicationsPage, OneApplication } from "@/lib/student-api";
import { useApi } from "@/lib/use-api";
import { formMessage } from "@/lib/use-form";

/** Applications still in play; withdrawn and closed ones can't share anything. */
const OPEN: readonly ApplicationStatus[] = ["applied", "shortlisted", "interview"];
/** The api caps a page at 50; enough for any student's open applications. */
const PAGE = 50;

const jobName = (application: StudentApplicationView) =>
  `${application.job.title} at ${application.job.companyName}`;

/**
 * Attach this scorecard to one of the student's open applications, or stop sharing it. The
 * employer sees the scores, the reasons and the quoted lines, not the whole transcript.
 */
export function ShareScorecard({ attemptId }: { attemptId: string }) {
  const applications = useApi(`/me/applications?pageSize=${String(PAGE)}`, ApplicationsPage);
  const selectId = useId();
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const [news, setNews] = useState("");

  if (applications.state === "loading") {
    return <Loading label="Loading your applications" lines={2} />;
  }
  if (applications.state === "error") {
    return <LoadError what="your applications" onRetry={applications.reload} />;
  }

  const items = applications.data.items;
  const sharing = items.filter((application) => application.sharedAttemptId === attemptId);
  const open = items.filter(
    (application) => OPEN.includes(application.status) && application.sharedAttemptId !== attemptId,
  );
  const selected = open.find((application) => application.id === choice) ?? open[0];

  async function share(application: StudentApplicationView, share: boolean) {
    setBusy(application.id);
    setProblem("");
    try {
      const updated = await apiFetch(`/applications/${application.id}/scorecard`, {
        method: "PUT",
        body: { attemptId: share ? attemptId : null },
        schema: OneApplication,
      });
      applications.update((page) => ({
        ...page,
        items: page.items.map((item) => (item.id === updated.id ? updated : item)),
      }));
      setChoice("");
      setNews(
        share
          ? "Done. That employer can see this scorecard now."
          : "Done. That employer can’t see this scorecard anymore.",
      );
    } catch (error) {
      setProblem(formMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {sharing.length > 0 && (
        <ul className="flex flex-col gap-2">
          {sharing.map((application) => (
            <li
              key={application.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-control bg-primary-soft px-4 py-3"
            >
              <span className="text-ink">Shared with {jobName(application)}</span>
              <Button
                variant="ghost"
                size="sm"
                loading={busy === application.id}
                disabled={busy !== null}
                onClick={() => void share(application, false)}
              >
                Stop sharing
                <span className="sr-only"> with {jobName(application)}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor={selectId} className="text-small font-semibold text-ink">
              Application
            </label>
            <select
              id={selectId}
              value={selected.id}
              onChange={(event) => {
                setChoice(event.target.value);
              }}
              className="h-11 w-full rounded-control border border-muted bg-surface px-3.5 text-body text-ink"
            >
              {open.map((application) => (
                <option key={application.id} value={application.id}>
                  {jobName(application)}
                  {application.hasSharedScorecard ? " (replaces its scorecard)" : ""}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="secondary"
            loading={busy === selected.id}
            disabled={busy !== null}
            onClick={() => void share(selected, true)}
          >
            Share
          </Button>
        </div>
      ) : (
        sharing.length === 0 && (
          <p className="text-ink">
            You have no open applications to attach this to. When you apply for a job, you can
            attach a scorecard there too.{" "}
            <Link href="/app/jobs" className="pp-link rounded-control font-semibold text-primary">
              Browse jobs
            </Link>
          </p>
        )
      )}

      <p role="alert" className="text-small text-danger empty:hidden">
        {problem}
      </p>
      <p role="status" className="sr-only">
        {news}
      </p>
    </div>
  );
}
