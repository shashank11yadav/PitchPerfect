"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { OneJob } from "@/lib/employer-api";
import { JobForm, type JobContent, type JobIntent } from "./JobForm";

/**
 * A new job. "Publish" creates it live in one request (the api takes `status: "active"` on
 * create), so a failed publish never leaves a stray draft; then it opens in the editor.
 */
export function NewJob() {
  const router = useRouter();

  async function create(content: JobContent, intent: JobIntent) {
    const job = await apiFetch("/employer/jobs", {
      method: "POST",
      body: intent === "publish" ? { ...content, status: "active" } : content,
      schema: OneJob,
    });
    router.push(`/employer/jobs/${job.id}?created=${intent === "publish" ? "published" : "draft"}`);
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Link
        href="/employer/jobs"
        className="pp-link inline-flex items-center gap-1.5 self-start rounded-control py-1 text-small font-semibold text-primary"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        All jobs
      </Link>
      <div className="flex flex-col gap-1">
        <h2 className="text-h2">Post a job</h2>
        <p className="max-w-prose text-ink">
          Save a draft whenever you like. Nothing is public until you publish.
        </p>
      </div>
      <Card className="md:p-8">
        <JobForm onSubmit={create} />
      </Card>
    </div>
  );
}
