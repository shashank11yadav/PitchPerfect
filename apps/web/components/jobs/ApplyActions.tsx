"use client";

import { PublicJobSummaryPageSchema } from "@pitchperfect/shared";
import { ArrowRight, Bookmark, BookmarkCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, apiFetch, type Parser } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** The job ids in a page of `GET /api/me/applications`. */
const AppliedJobIds: Parser<string[]> = {
  parse(data) {
    if (!isObject(data) || !Array.isArray(data.items)) {
      throw new Error("Unexpected /me/applications response");
    }
    return data.items.flatMap((item: unknown) =>
      isObject(item) && isObject(item.job) && typeof item.job.id === "string" ? [item.job.id] : [],
    );
  },
};

/**
 * Saved and applied state come from the first page of each list. Missing a job further back
 * only means the button starts in its default state: saving is idempotent and applying twice
 * gets a clear "already applied".
 */
const STATE_PAGE_SIZE = 50;

type Busy = "apply" | "save" | null;

interface Notice {
  tone: "done" | "problem";
  text: ReactNode;
}

const linkClass = (dark: boolean) =>
  cn("pp-link rounded-control font-semibold", dark ? "text-white" : "text-primary");

function ApplicationsLink({ dark }: { dark: boolean }) {
  return (
    <Link href="/app/applications" className={linkClass(dark)}>
      your applications
    </Link>
  );
}

function AppliedNote({ dark }: { dark: boolean }) {
  return (
    <>
      You’ve already applied to this job. It’s in <ApplicationsLink dark={dark} />.
    </>
  );
}

interface ApplyActionsProps {
  jobId: string;
  slug: string;
  /** On a navy ground: white button and white text. */
  dark?: boolean;
}

/**
 * Apply and save for a job page. The page is the same for everyone, so this island reads the
 * session: visitors get a sign-in link, students get apply and save, employers a note.
 */
export function ApplyActions({ jobId, slug, dark = false }: ApplyActionsProps) {
  const session = useSession();
  const viewer =
    session.status === "signed_in" && session.user
      ? session.user.role
      : session.status === "loading"
        ? "loading"
        : "signed-out";
  const [saved, setSaved] = useState(false);
  const [applied, setApplied] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  /** Read out when saving changes the button's label under the screen reader's focus. */
  const [saveNews, setSaveNews] = useState("");
  const noticeRef = useRef<HTMLParagraphElement>(null);
  /** Set when applying removes the focused Apply button, so focus lands on the result instead. */
  const focusNotice = useRef(false);

  useEffect(() => {
    if (!focusNotice.current) return;
    focusNotice.current = false;
    noticeRef.current?.focus();
  }, [notice]);

  useEffect(() => {
    if (viewer !== "student") return;
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      const [savedJobs, applications] = await Promise.allSettled([
        apiFetch(`/me/saved-jobs?pageSize=${String(STATE_PAGE_SIZE)}`, {
          schema: PublicJobSummaryPageSchema,
          signal,
        }),
        apiFetch(`/me/applications?pageSize=${String(STATE_PAGE_SIZE)}`, {
          schema: AppliedJobIds,
          signal,
        }),
      ]);
      if (signal.aborted) return;
      if (savedJobs.status === "fulfilled") {
        setSaved(savedJobs.value.items.some((job) => job.id === jobId));
      }
      if (applications.status === "fulfilled" && applications.value.includes(jobId)) {
        setApplied(true);
        setNotice({ tone: "done", text: <AppliedNote dark={dark} /> });
      }
    })();
    return () => {
      controller.abort();
    };
  }, [viewer, jobId, dark]);

  const text = dark ? "text-white" : "text-ink";
  const placeholder = cn(
    "block animate-pulse rounded-pill motion-reduce:animate-none",
    dark ? "bg-white/20" : "bg-border",
  );

  async function apply() {
    setBusy("apply");
    setNotice(null);
    try {
      await apiFetch(`/jobs/${jobId}/apply`, { method: "POST", body: {} });
      setApplied(true);
      focusNotice.current = true;
      setNotice({
        tone: "done",
        text: (
          <>
            Your application is in. Follow it from <ApplicationsLink dark={dark} />.
          </>
        ),
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === "already_applied") {
        setApplied(true);
        focusNotice.current = true;
        setNotice({ tone: "done", text: <AppliedNote dark={dark} /> });
      } else if (error instanceof ApiError && error.code === "email_not_verified") {
        setNotice({
          tone: "problem",
          text: "Verify your email before you apply. The link is in the email we sent when you signed up.",
        });
      } else {
        setNotice({ tone: "problem", text: messageOf(error) });
      }
    } finally {
      setBusy(null);
    }
  }

  async function toggleSave() {
    const next = !saved;
    setBusy("save");
    setNotice(null);
    try {
      await apiFetch(`/jobs/${jobId}/save`, { method: next ? "PUT" : "DELETE" });
      setSaved(next);
      setSaveNews(next ? "Saved to your jobs." : "Removed from your saved jobs.");
    } catch (error) {
      setNotice({ tone: "problem", text: messageOf(error) });
    } finally {
      setBusy(null);
    }
  }

  let controls: ReactNode;
  if (viewer === "loading") {
    controls = (
      <div aria-busy="true" className="flex items-center gap-7">
        <span className="sr-only">Checking whether you’re signed in</span>
        <span className={cn(placeholder, "h-12 w-36")} />
        <span className={cn(placeholder, "h-5 w-24")} />
      </div>
    );
  } else if (viewer === "signed-out") {
    const next = encodeURIComponent(`/jobs/${slug}`);
    controls = (
      <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
        <Link
          href={`/signin?next=${next}`}
          className={buttonClasses({ variant: dark ? "inverse" : "primary", size: "lg" })}
        >
          Sign in to apply
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
        <Link href="/signup/student" className={cn(linkClass(dark), "py-2")}>
          Create an account
        </Link>
      </div>
    );
  } else if (viewer === "employer") {
    controls = (
      <p className={cn("max-w-[36ch]", text)}>
        You’re signed in as an employer. Applying is for student accounts.
      </p>
    );
  } else {
    controls = (
      <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
        {!applied && (
          <button
            type="button"
            onClick={() => void apply()}
            disabled={busy !== null}
            aria-busy={busy === "apply" || undefined}
            className={buttonClasses({ variant: dark ? "inverse" : "primary", size: "lg" })}
          >
            {busy === "apply" && <Spinner />}
            Apply
          </button>
        )}
        <button
          type="button"
          onClick={() => void toggleSave()}
          disabled={busy !== null}
          aria-busy={busy === "save" || undefined}
          className={cn(
            "pp-press inline-flex items-center gap-2 rounded-pill py-2 font-semibold disabled:opacity-60",
            dark ? "text-white" : "text-primary",
          )}
        >
          {saved ? (
            <BookmarkCheck aria-hidden="true" className="size-5" />
          ) : (
            <Bookmark aria-hidden="true" className="size-5" />
          )}
          {saved ? "Saved" : "Save job"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {controls}
      <span role="status" className="sr-only">
        {saveNews}
      </span>
      <p
        ref={noticeRef}
        role="status"
        tabIndex={-1}
        className={cn(
          "max-w-[40ch] rounded-control text-body empty:sr-only focus:outline-none",
          text,
          notice?.tone === "problem" && !dark && "text-danger",
        )}
      >
        {notice?.text}
      </p>
    </div>
  );
}

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong. Try again.";
}
