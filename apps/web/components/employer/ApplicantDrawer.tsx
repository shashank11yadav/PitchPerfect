"use client";

import {
  APPLICATION_TRANSITIONS,
  canTransition,
  LIMITS,
  type ApplicationStatus,
  type EmployerApplicationView,
} from "@pitchperfect/shared";
import { Bookmark, Download } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { InterviewSlot } from "@/components/jobs/InterviewSlot";
import { StatusPill } from "@/components/student/StatusPill";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";
import { EMPLOYER_API_MESSAGES, OneApplicant } from "@/lib/employer-api";
import { formatInterviewTime, formatLocalDate } from "@/lib/local-time";
import { useSession } from "@/lib/session";
import { formMessage } from "@/lib/use-form";
import { InterviewDialog } from "./InterviewDialog";
import { SharedScorecardPanel } from "./SharedScorecardPanel";

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

/** What each move did, as announced after it. */
const MOVED: Record<SettableStatus, (firstName: string) => string> = {
  shortlisted: (firstName) => `${firstName} is shortlisted.`,
  hired: (firstName) => `${firstName} is marked as hired.`,
  rejected: (firstName) => `${firstName} is marked as not a fit.`,
};

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

/** Decided or closed: the résumé stays downloadable for a few days, then the api stops serving it. */
const ENDED: readonly ApplicationStatus[] = ["hired", "rejected", "closed"];
const GRACE = `${String(LIMITS.resumeAccessGraceDays)} days`;

/** The résumé download while the api still serves it, and why it's missing when it doesn't. */
function ResumeAccess({
  application,
  path,
}: {
  application: EmployerApplicationView;
  path: string;
}) {
  const ended = ENDED.includes(application.status);
  if (!application.hasResume) {
    return (
      <p className="max-w-prose text-ink">
        {ended
          ? `No résumé to download. Résumés stay available for ${GRACE} after an application is decided or closed.`
          : `${application.student.firstName}’s application has no résumé.`}
      </p>
    );
  }
  return (
    <>
      <a href={`/api${path}/resume`} download className={cn(TEXT_LINK, "self-start")}>
        <Download aria-hidden="true" className="size-4" />
        Download résumé (PDF)
      </a>
      {ended && (
        <p className="max-w-prose text-small text-muted">
          You can download it until {GRACE} after the application was decided or closed.
        </p>
      )}
    </>
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
  const path = `/employer/applications/${encodeURIComponent(id)}`;
  const name = `${student.firstName} ${student.lastName}`;
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const [confirming, setConfirming] = useState<"hired" | "rejected" | null>(null);
  const [scheduling, setScheduling] = useState(false);
  /** What the last move did, announced; and a counter that sends focus to the new status. */
  const [news, setNews] = useState("");
  const [moves, setMoves] = useState(0);
  const statusLine = useRef<HTMLParagraphElement>(null);

  // After a move the button (or dialog) that made it is often gone; the status is where it landed.
  useEffect(() => {
    if (moves > 0) statusLine.current?.focus();
  }, [moves]);

  const moved = (updated: EmployerApplicationView, message: string) => {
    onChange(updated);
    setNews(message);
    setMoves((count) => count + 1);
  };

  const { company } = useSession();
  const withdrawn = status === "withdrawn";
  // The api sends invites for verified companies only; the others are told why the button is missing.
  const schedulable = canTransition(status, "interview", "employer");
  const canSchedule = schedulable && company?.verification === "verified";
  const actions = employerActions(status);

  async function setStatus(next: SettableStatus) {
    const updated = await apiFetch(path, {
      method: "PATCH",
      body: { status: next },
      schema: OneApplicant,
    });
    moved(updated, MOVED[next](student.firstName));
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
      await apiFetch(`${path}/save`, { method: saved ? "PUT" : "DELETE" });
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
        <p
          ref={statusLine}
          tabIndex={-1}
          data-testid="applicant-status"
          className="flex items-center gap-2 self-start rounded-control text-ink outline-none"
        >
          <span className="text-small text-muted">Status</span>
          <StatusPill status={status} viewer="employer" />
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
        {schedulable && !canSchedule && (
          <p className="max-w-prose text-small text-ink">
            Only verified companies can send interview invites.{" "}
            <Link href="/employer/company" className="pp-link font-semibold text-primary">
              See how to get verified
            </Link>
            .
          </p>
        )}
        <p role="status" className="font-semibold text-ink empty:sr-only">
          {news}
        </p>
        <p role="alert" className="text-danger empty:sr-only">
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
            <ResumeAccess application={application} path={path} />
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
        companyWebsite={company?.website ?? ""}
        onClose={() => {
          setScheduling(false);
        }}
        onScheduled={(updated) => {
          const when = updated.interview ? formatInterviewTime(updated.interview.startsAt) : "";
          moved(
            updated,
            status === "interview"
              ? `Interview moved to ${when}. ${student.firstName} gets an email with the new time.`
              : `Interview booked for ${when}. ${student.firstName} gets an email with the details.`,
          );
        }}
      />
    </Card>
  );
}
