"use client";

import type { EmployerDashboard } from "@pitchperfect/shared";
import { ArrowRight, Briefcase } from "lucide-react";
import Link from "next/link";
import { StatusPill } from "@/components/student/StatusPill";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadError, Loading } from "@/components/ui/LoadState";
import { Dashboard } from "@/lib/employer-api";
import { formatLocalDate } from "@/lib/local-time";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/use-api";
import { CompanyMark } from "./CompanyForm";
import { VerificationBanner } from "./VerificationBanner";

const TEXT_LINK =
  "pp-link inline-flex items-center gap-1.5 self-start rounded-control font-semibold text-primary";

const applicantHref = (jobId: string, applicationId: string) =>
  `/employer/jobs/${jobId}/applicants?application=${applicationId}`;

function Counts({ data }: { data: EmployerDashboard }) {
  const counts: [string, number][] = [
    ["Active jobs", data.activeJobs],
    ["Drafts", data.drafts],
    ["Open applications", data.applicants],
    ["Upcoming interviews", data.interviewsUpcoming],
  ];
  return (
    <Card as="section" aria-labelledby="dash-counts" flush>
      <h2 id="dash-counts" className="sr-only">
        Your jobs and applicants in numbers
      </h2>
      <ul
        aria-label="Your jobs and applicants in numbers"
        className="grid grid-cols-2 divide-border md:grid-cols-4 md:divide-x"
      >
        {counts.map(([label, value]) => (
          <li key={label} className="flex flex-col-reverse gap-1 p-5 md:p-6">
            <span className="text-small text-muted">{label}</span>
            <span className="font-display text-h2 font-bold text-navy">{value}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RecentApplications({ data }: { data: EmployerDashboard }) {
  if (data.recentApplications.length === 0) {
    return (
      <p className="max-w-prose text-ink">
        No applications yet. Your active jobs are on the public job board, and students who apply
        show up here with their school, major and anything they choose to share, like a résumé or a
        practice scorecard.
      </p>
    );
  }
  return (
    <ul className="-mx-2 flex flex-col">
      {data.recentApplications.map((application) => (
        <li key={application.id}>
          <Link
            href={applicantHref(application.jobId, application.id)}
            className="grid gap-x-4 gap-y-1 rounded-control px-2 py-3 hover:bg-surface-2 sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <span className="min-w-0">
              <span className="block font-semibold text-ink">
                {application.student.firstName} {application.student.lastName}
              </span>
              <span className="block text-small text-muted">
                {application.jobTitle} · Applied{" "}
                <time dateTime={application.appliedAt}>
                  {formatLocalDate(application.appliedAt)}
                </time>
              </span>
            </span>
            <span className="justify-self-start sm:justify-self-end">
              <StatusPill status={application.status} viewer="employer" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * The employer's home: how many jobs and applicants there are, the newest applications, and
 * where the company's verification stands when it needs attention.
 */
export function DashboardStats() {
  const { company } = useSession();
  const dashboard = useApi("/employer/dashboard", Dashboard);

  if (dashboard.state === "loading") return <Loading label="Loading your dashboard" lines={5} />;
  if (dashboard.state === "error") {
    return <LoadError what="your dashboard" onRetry={dashboard.reload} />;
  }
  const data = dashboard.data;
  const noJobs = data.activeJobs === 0 && data.drafts === 0;

  return (
    <div className="flex flex-col gap-6">
      {company && company.verification !== "verified" && (
        <VerificationBanner
          verification={company.verification}
          website={company.website}
          sample={company.sample}
        />
      )}
      {noJobs ? (
        <EmptyState
          icon={<Briefcase className="size-6" />}
          title="Post your first job"
          description="Write the role, the pay and what a normal week looks like. Save it as a draft until it reads right, then publish it to the job board."
          action={
            <Link href="/employer/jobs/new" className={buttonClasses()}>
              Post a job
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            {company && (
              <p className="flex min-w-0 items-center gap-3">
                <CompanyMark name={company.name} size="sm" />
                <span className="font-display text-h4 font-semibold text-navy [overflow-wrap:anywhere]">
                  {company.name}
                </span>
              </p>
            )}
            <Link href="/employer/jobs/new" className={buttonClasses()}>
              Post a job
            </Link>
          </div>
          <Counts data={data} />
          <Card as="section" aria-labelledby="dash-recent" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="dash-recent" className="text-h4">
                Recent applications
              </h2>
              <Link href="/employer/jobs" className={TEXT_LINK}>
                All jobs
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
            <RecentApplications data={data} />
          </Card>
        </>
      )}
    </div>
  );
}
