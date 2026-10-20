"use client";

import {
  APPLICATION_TRANSITIONS,
  canTransition,
  getSkill,
  type ApplicationStatus,
  type EmployerApplicationView,
} from "@pitchperfect/shared";
import { Bookmark, Download } from "lucide-react";
import { useState } from "react";
import { InterviewSlot } from "@/components/jobs/InterviewSlot";
import { ScorecardDetails } from "@/components/practice/ScorecardDetails";
import { StatusPill } from "@/components/student/StatusPill";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LoadError, Loading } from "@/components/ui/LoadState";
import { ApiError, apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";
import { EMPLOYER_API_MESSAGES, OneApplicant, SharedScorecard } from "@/lib/employer-api";
import { formatLocalDate } from "@/lib/local-time";
import { useApi } from "@/lib/use-api";
import { formMessage } from "@/lib/use-form";
import { InterviewDialog } from "./InterviewDialog";

type SettableStatus = "shortlisted" | "hired" | "rejected";

/**
 * The statuses an employer can set from `status` with a plain status change: the shared
 * transitions minus `interview`, which only the scheduling dialog sets, because it needs a slot.
 */
export function employerActions(status: ApplicationStatus): SettableStatus[] {
  return (APPLICATION_TRANSITIONS.employer[status] ?? []).filter(
    (next): next is SettableStatus => next !== "interview",
  );
}

const ACTION_LABELS: Record<SettableStatus, string> = {
  shortlisted: "Shortlist",
  hired: "Hire",
  rejected: "Not a fit",
};

/** Hiring and turning someone down can't be taken back, so they ask first. */
function confirmCopy(status: "hired" | "rejected", firstName: string) {
  return status === "hired"
    ? {
        title: `Mark ${firstName} as hired?`,
        description: `${firstName}’s application will show “Hired”. You can’t change it afterwards.`,
        confirmLabel: "Mark as hired",
      }
    : {
        title: `Mark ${firstName} as not a fit?`,
        description: `${firstName}’s application will show “Not selected”. We don’t send them an email about it, and you can’t change it afterwards.`,
        confirmLabel: "Mark as not a fit",
      };
}

const TEXT_LINK =
  "pp-link inline-flex items-center gap-1.5 rounded-control font-semibold text-primary";

/** The scorecard the student attached, read-only. Asked for only when one was shared. */
function SharedScorecardPanel({
  applicationId,
  firstName,
}: {
  applicationId: string;
  firstName: string;
}) {
  const shared = useApi(`/employer/applications/${applicationId}/scorecard`, SharedScorecard);
  if (shared.state === "loading") return <Loading label="Loading the scorecard" lines={4} />;
  if (shared.state === "error") {
    if (shared.error instanceof ApiError && shared.error.status === 404) {
      return <p className="text-ink">No scorecard shared</p>;
    }
    return <LoadError what="the scorecard" onRetry={shared.reload} />;
  }
  const { scorecard, skill, completedAt } = shared.data;
  const { title, weighted } = getSkill(skill);
  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-prose text-small text-ink">
        {firstName} attached this scorecard from a {title.toLowerCase()} practice call with the AI
        practice partner{completedAt ? `, ${formatLocalDate(completedAt)}` : ""}. The quotes are
        their own words from that call.
      </p>
      <div className="overflow-hidden rounded-card border border-border">
        <ScorecardDetails
          scorecard={scorecard}
          skillTitle={title}
          weighted={weighted}
          headingLevel="h4"
        />
      </div>
    </div>
  );
}

interface ApplicantDrawerProps {
  application: EmployerApplicationView;
  jobTitle: string;
  /** The application after a change the api has accepted. */
  onChange: (application: EmployerApplicationView) => void;
}

/**
 * One applicant, beside the list: what they shared, and the moves the shared transition table
 * allows from where the application is now.
 */
export function ApplicantDrawer({ application, jobTitle, onChange }: ApplicantDrawerProps) {
  const { id, status, student, interview } = application;
  const name = `${student.firstName} ${student.lastName}`;
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const [confirming, setConfirming] = useState<"hired" | "rejected" | null>(null);
  const [scheduling, setScheduling] = useState(false);

  const withdrawn = status === "withdrawn";
  const canSchedule = canTransition(status, "interview", "employer");
  const actions = employerActions(status);

  async function setStatus(next: SettableStatus) {
    const updated = await apiFetch(`/employer/applications/${id}`, {
      method: "PATCH",
      body: { status: next },
      schema: OneApplicant,
    });
    onChange(updated);
  }

  async function run(key: string, work: () => Promise<void>) {
    setBusy(key);
    setProblem("");
    try {
      await work();
    } catch (error) {
      setProblem(formMessage(error, EMPLOYER_API_MESSAGES));
    } finally {
      setBusy(null);
    }
  }

  const toggleSave = () =>
    run("save", async () => {
      const saved = !application.savedByEmployer;
      await apiFetch(`/employer/applications/${id}/save`, { method: saved ? "PUT" : "DELETE" });
      onChange({ ...application, savedByEmployer: saved });
    });

  const confirm = confirming ? confirmCopy(confirming, student.firstName) : null;

  return (
    <Card as="section" aria-labelledby="applicant-name" className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 id="applicant-name" tabIndex={-1} className="text-h3 outline-none">
            {name}
          </h2>
          <p className="mt-1 text-ink">
            {student.school} · {student.major} · Class of {student.gradYear}
          </p>
          <p className="mt-1 text-small text-muted">
            Applied{" "}
            <time dateTime={application.appliedAt}>{formatLocalDate(application.appliedAt)}</time>{" "}
            to {jobTitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={application.savedByEmployer}
            loading={busy === "save"}
            onClick={() => void toggleSave()}
            className="aria-pressed:bg-primary-soft"
          >
            <Bookmark
              aria-hidden="true"
              className={cn("size-4", application.savedByEmployer && "fill-current")}
            />
            Save
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-4 border-t border-border pt-5">
        <p className="flex items-center gap-2 text-ink">
          <span className="text-small text-muted">Status</span>
          <StatusPill status={status} />
        </p>
        {status === "interview" && interview && (
          <InterviewSlot interview={interview} linkLabel="Meeting link" />
        )}
        {withdrawn && (
          <p className="max-w-prose text-ink">
            {student.firstName} withdrew this application, so their résumé and scorecard are no
            longer shared with you.
          </p>
        )}
        {status === "closed" && (
          <p className="max-w-prose text-ink">This application closed when the job was archived.</p>
        )}
        {(canSchedule || actions.length > 0) && (
          <div role="group" aria-label="Move this application" className="flex flex-wrap gap-3">
            {canSchedule && (
              <Button
                onClick={() => {
                  setScheduling(true);
                }}
              >
                {status === "interview" ? "Reschedule" : "Schedule interview"}
              </Button>
            )}
            {actions.map((next) => (
              <Button
                key={next}
                variant={next === "shortlisted" && !canSchedule ? "primary" : "secondary"}
                loading={busy === next}
                disabled={busy !== null}
                onClick={() => {
                  if (next === "shortlisted") void run(next, () => setStatus(next));
                  else setConfirming(next);
                }}
              >
                {ACTION_LABELS[next]}
              </Button>
            ))}
          </div>
        )}
        <p role="alert" className="text-danger empty:hidden">
          {problem}
        </p>
      </div>

      {!withdrawn && (
        <>
          <section
            aria-labelledby="applicant-resume"
            className="flex flex-col gap-2 border-t border-border pt-5"
          >
            <h3 id="applicant-resume" className="text-h4">
              Résumé
            </h3>
            {application.hasResume ? (
              <a
                href={`/api/employer/applications/${id}/resume`}
                download
                className={cn(TEXT_LINK, "self-start")}
              >
                <Download aria-hidden="true" className="size-4" />
                Download résumé (PDF)
              </a>
            ) : (
              <p className="text-ink">{student.firstName} hasn’t uploaded a résumé.</p>
            )}
          </section>
          <section
            aria-labelledby="applicant-scorecard"
            className="flex flex-col gap-3 border-t border-border pt-5"
          >
            <h3 id="applicant-scorecard" className="text-h4">
              Practice scorecard
            </h3>
            {application.hasSharedScorecard ? (
              <SharedScorecardPanel key={id} applicationId={id} firstName={student.firstName} />
            ) : (
              <p className="text-ink">No scorecard shared</p>
            )}
          </section>
        </>
      )}

      {confirm && (
        <ConfirmDialog
          open
          onClose={() => {
            setConfirming(null);
          }}
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.confirmLabel}
          cancelLabel="Go back"
          tone={confirming === "hired" ? "primary" : "danger"}
          apiMessages={EMPLOYER_API_MESSAGES}
          onConfirm={() => setStatus(confirming as SettableStatus)}
        />
      )}
      <InterviewDialog
        open={scheduling}
        application={application}
        onClose={() => {
          setScheduling(false);
        }}
        onScheduled={onChange}
      />
    </Card>
  );
}
