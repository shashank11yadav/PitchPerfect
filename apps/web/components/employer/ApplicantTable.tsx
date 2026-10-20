"use client";

import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type EmployerApplicationView,
} from "@pitchperfect/shared";
import { ArrowLeft, Bookmark, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { STATUS_LABELS, StatusPill } from "@/components/student/StatusPill";
import { Checkbox } from "@/components/ui/Checkbox";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterTabs, type FilterOption } from "@/components/ui/FilterTabs";
import { LoadError, Loading } from "@/components/ui/LoadState";
import { Pagination } from "@/components/ui/Pagination";
import { ApplicantsPage } from "@/lib/employer-api";
import { formatLocalDate } from "@/lib/local-time";
import { useApi } from "@/lib/use-api";
import { ApplicantDrawer } from "./ApplicantDrawer";

type StatusFilter = ApplicationStatus | "all";

const STATUS_FILTERS: readonly FilterOption<StatusFilter>[] = [
  { value: "all", label: "All" },
  ...APPLICATION_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] })),
];

const TEXT_BUTTON = "pp-link rounded-control font-semibold text-primary";

function applicationsPath(jobId: string, page: number, status: StatusFilter, saved: boolean) {
  const query = new URLSearchParams({ page: String(page) });
  if (status !== "all") query.set("status", status);
  if (saved) query.set("saved", "true");
  return `/employer/jobs/${jobId}/applications?${query.toString()}`;
}

const rowId = (id: string) => `applicant-${id}`;

interface ApplicantTableProps {
  jobId: string;
  jobTitle: string;
  /** An application to open straight away, e.g. from the dashboard's recent list. */
  initialId?: string | undefined;
}

/**
 * A job's applicants, newest first, filtered by status and by the ones the employer saved.
 * Opening one shows its details in place of the list; closing goes back to the same row.
 */
export function ApplicantTable({ jobId, jobTitle, initialId }: ApplicantTableProps) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [saved, setSaved] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | undefined>(initialId);
  const returnTo = useRef<string | null>(null);
  const list = useApi(applicationsPath(jobId, page, status, saved), ApplicantsPage);

  const selected =
    list.state === "ready" ? list.data.items.find((item) => item.id === selectedId) : undefined;

  // Back from an applicant, focus lands on the row it was opened from.
  useEffect(() => {
    if (selected || !returnTo.current) return;
    document.getElementById(rowId(returnTo.current))?.focus();
    returnTo.current = null;
  }, [selected]);

  // Into an applicant, focus moves to their name, so the change is announced.
  const openId = selected?.id;
  useEffect(() => {
    if (openId) document.getElementById("applicant-name")?.focus();
  }, [openId]);

  const replace = (updated: EmployerApplicationView) => {
    list.update((data) => ({
      ...data,
      items: data.items.map((item) => (item.id === updated.id ? updated : item)),
    }));
  };

  if (selected) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => {
            returnTo.current = selected.id;
            setSelectedId(undefined);
          }}
          className={`${TEXT_BUTTON} inline-flex items-center gap-1.5 self-start py-1`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          All applicants
        </button>
        <ApplicantDrawer application={selected} jobTitle={jobTitle} onChange={replace} />
      </div>
    );
  }

  const filtered = status !== "all" || saved;
  const columns: Column<EmployerApplicationView>[] = [
    {
      key: "applicant",
      header: "Applicant",
      cell: (row) => (
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            id={rowId(row.id)}
            onClick={() => {
              setSelectedId(row.id);
            }}
            className={`${TEXT_BUTTON} self-start text-left text-body`}
          >
            {row.student.firstName} {row.student.lastName}
          </button>
          <span className="text-muted">
            {row.student.school} · {row.student.major} · {row.student.gradYear}
          </span>
        </div>
      ),
    },
    {
      key: "applied",
      header: "Applied",
      className: "hidden whitespace-nowrap sm:table-cell",
      cell: (row) => <time dateTime={row.appliedAt}>{formatLocalDate(row.appliedAt)}</time>,
    },
    {
      key: "shared",
      header: "Shared",
      className: "hidden md:table-cell",
      cell: (row) =>
        [row.hasResume && "Résumé", row.hasSharedScorecard && "Scorecard"]
          .filter(Boolean)
          .join(", ") || <span className="text-muted">Nothing yet</span>,
    },
    {
      key: "status",
      header: "Status",
      className: "w-px whitespace-nowrap",
      cell: (row) => (
        <span className="inline-flex items-center gap-2">
          <StatusPill status={row.status} />
          {row.savedByEmployer && (
            <>
              <Bookmark aria-hidden="true" className="size-4 fill-current text-primary" />
              <span className="sr-only">Saved</span>
            </>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          label="Status"
          options={STATUS_FILTERS}
          value={status}
          onChange={(next) => {
            setStatus(next);
            setPage(1);
          }}
        />
        <Checkbox
          label="Saved only"
          checked={saved}
          onChange={(event) => {
            setSaved(event.target.checked);
            setPage(1);
          }}
          className="shrink-0"
        />
      </div>

      {list.state === "loading" && <Loading label="Loading applicants" lines={4} />}
      {list.state === "error" && <LoadError what="the applicants" onRetry={list.reload} />}
      {list.state === "ready" &&
        (list.data.total === 0 ? (
          filtered ? (
            <p className="text-ink">
              No applicants match these filters.{" "}
              <button
                type="button"
                onClick={() => {
                  setStatus("all");
                  setSaved(false);
                }}
                className={TEXT_BUTTON}
              >
                Show everyone
              </button>
            </p>
          ) : (
            <EmptyState
              icon={<Users className="size-6" />}
              title="No applicants yet"
              description="When students apply, they show up here with their school and major, plus a résumé and practice scorecard if they attached them."
            />
          )
        ) : (
          <>
            <DataTable
              caption={`Applicants for ${jobTitle}`}
              columns={columns}
              rows={list.data.items}
              rowKey={(row) => row.id}
            />
            <Pagination
              page={list.data.page}
              pageSize={list.data.pageSize}
              total={list.data.total}
              onPageChange={setPage}
            />
          </>
        ))}
    </div>
  );
}
