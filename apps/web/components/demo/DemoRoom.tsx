"use client";

import { isSkillSlug, type SkillSlug } from "@pitchperfect/shared";
import { History } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import { AttemptScreen } from "@/components/practice/AttemptScreen";
import { PracticeHistory } from "@/components/practice/PracticeHistory";
import { PracticeRoom } from "@/components/practice/PracticeRoom";
import { PracticeOverview } from "@/components/practice/SkillGrid";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { readDemoState, subscribeDemoState } from "@/lib/demo/store";
import { practiceHref } from "@/lib/practice/paths";
import { ProvideSession, type Session } from "@/lib/session";

/**
 * The static demo's practice pages. The room, lobby and history are the app's own components;
 * they read the session for consent and the api for everything else, and in this build both are
 * answered from the browser (lib/demo). The query string carries what a route param would.
 */

/** A fixed date: the visitor's "account" has nothing to confirm. */
const VISITOR_SINCE = "2026-01-01T00:00:00.000Z";

const consentAt = () => readDemoState().consentAt;
const noConsent = () => null;

/** The visitor as the room sees a student: verified, consented once they accept the notice. */
function DemoSession({ children }: { children: ReactNode }) {
  const practiceConsentAt = useSyncExternalStore(subscribeDemoState, consentAt, noConsent);
  const session = useMemo<Session>(
    () => ({
      status: "signed_in",
      user: {
        id: "demo-visitor",
        email: "visitor@example.test",
        role: "student",
        firstName: "Demo",
        lastName: "Visitor",
        emailVerifiedAt: VISITOR_SINCE,
        practiceConsentAt,
      },
      refresh: () => Promise.resolve("signed_in"),
      signOut: () => Promise.resolve(),
      leaving: false,
    }),
    [practiceConsentAt],
  );
  return <ProvideSession session={session}>{children}</ProvideSession>;
}

/** `?jobId=` when it looks like an id (the room checks that the job is listed). */
function useJobIdParam(): string | undefined {
  const jobId = useSearchParams().get("jobId");
  return jobId !== null && /^[a-f0-9]{24}$/i.test(jobId) ? jobId : undefined;
}

/** `/practice/`: pick a skill, with the job from the query string if there is one. */
export function DemoPracticeStart() {
  const jobId = useJobIdParam();
  return (
    <DemoSession>
      <PracticeOverview jobId={jobId} />
    </DemoSession>
  );
}

/** `/practice/[skill]/`: the start screen, the call, then the scorecard. */
export function DemoSkillRoom({ skill }: { skill: SkillSlug }) {
  const jobId = useJobIdParam();
  return (
    <DemoSession>
      <PracticeRoom skill={skill} jobId={jobId} />
    </DemoSession>
  );
}

/** `/practice/attempt/?id=`: one session, picked up where it was left or shown scored. */
export function DemoAttempt() {
  const id = useSearchParams().get("id");
  if (!id) {
    return (
      <EmptyState
        icon={<History className="size-6" />}
        title="Which session?"
        description="This address names no session. Your sessions from this tab are listed in the history."
        action={
          <Link href={practiceHref()} className={buttonClasses()}>
            Pick a skill
          </Link>
        }
      />
    );
  }
  return (
    <DemoSession>
      <AttemptScreen id={id} />
    </DemoSession>
  );
}

/** `/practice/history/?skill=&page=`: this tab's sessions. */
export function DemoHistory() {
  const params = useSearchParams();
  const skill = params.get("skill");
  const page = Number(params.get("page"));
  return (
    <DemoSession>
      <PracticeHistory
        skill={isSkillSlug(skill) ? skill : undefined}
        page={Number.isInteger(page) && page >= 1 ? page : 1}
      />
    </DemoSession>
  );
}
