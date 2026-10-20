"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadError, Loading } from "@/components/ui/LoadState";
import { Pagination } from "@/components/ui/Pagination";
import { ApplicationsPage } from "@/lib/student-api";
import { useApi } from "@/lib/use-api";
import { ApplicationRow } from "./ApplicationRow";

const pageHref = (page: number) =>
  page > 1 ? `/app/applications?page=${String(page)}` : "/app/applications";

/** The student's applications, newest first, one page at a time. */
export function ApplicationList({ page }: { page: number }) {
  const list = useApi(`/me/applications?page=${String(page)}`, ApplicationsPage);

  if (list.state === "loading") return <Loading label="Loading your applications" lines={4} />;
  if (list.state === "error") {
    return <LoadError what="your applications" onRetry={list.reload} />;
  }

  const { items, total, pageSize } = list.data;
  if (total === 0) {
    return (
      <EmptyState
        icon={<FileText className="size-6" />}
        title="You haven’t applied to any jobs yet"
        description="When you apply, the application shows up here with its status, and any interview an employer books with you."
        action={
          <Link href="/app/jobs" className={buttonClasses()}>
            Browse jobs
          </Link>
        }
      />
    );
  }
  if (items.length === 0) {
    return (
      <p className="text-ink">
        This page is past the end of the list.{" "}
        <Link href={pageHref(1)} className="pp-link rounded-control font-semibold text-primary">
          Go to the first page
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-ink">
        {total === 1 ? "1 application" : `${String(total)} applications`}, newest first.
      </p>
      <Card>
        <ul className="divide-y divide-border">
          {items.map((application) => (
            <ApplicationRow
              key={application.id}
              application={application}
              onChange={(updated) => {
                list.update((data) => ({
                  ...data,
                  items: data.items.map((item) => (item.id === updated.id ? updated : item)),
                }));
              }}
            />
          ))}
        </ul>
      </Card>
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={pageHref} />
    </div>
  );
}
