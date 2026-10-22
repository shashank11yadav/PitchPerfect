"use client";

import { LIMITS, RUBRIC_DIMENSIONS, getSkill, type SkillSlug } from "@pitchperfect/shared";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadError, Loading } from "@/components/ui/LoadState";
import { SCRIPTED_PARTNER_NOTICE } from "@/content/partner-notice";
import { attemptPath, historyHref, lessonPath, practiceHref } from "@/lib/practice/paths";
import type { PracticeQuotaLoad } from "@/lib/practice/use-practice-partner";
import type { PracticeRoomControls } from "@/lib/practice/use-practice-room";
import { useSession } from "@/lib/session";
import { AttemptsPage } from "@/lib/student-api";
import { useApi } from "@/lib/use-api";
import { VOICE_DISCLOSURE } from "./ComposeBar";
import { ConsentDialog } from "./ConsentDialog";
import { QuotaMeter } from "./QuotaMeter";
import { SkillSelect } from "./SkillSelect";

const TEXT_LINK = "pp-link rounded-control font-semibold text-primary";
const SESSION_MINUTES = LIMITS.sessionSeconds / 60;

/** A session not yet ended, from the newest attempt: the api keeps at most one active. */
function ActiveSession() {
  const newest = useApi("/practice/attempts?pageSize=1", AttemptsPage);
  if (newest.state !== "ready") return null;
  const [attempt] = newest.data.items;
  if (attempt?.status !== "active") return null;
  return (
    <p className="rounded-control bg-primary-soft px-4 py-3 text-ink">
      You have an unfinished {getSkill(attempt.skill).title.toLowerCase()} call.{" "}
      <Link href={attemptPath(attempt.id)} className={TEXT_LINK}>
        Go back to it
      </Link>{" "}
      to keep going or get it scored. Starting a new call ends that one without a score.
    </p>
  );
}

function SkillSwitch({ skill, jobId }: { skill: SkillSlug; jobId: string }) {
  const router = useRouter();
  return (
    <SkillSelect
      label="Skill to practice"
      value={skill}
      onSelect={(next) => {
        if (next) router.push(practiceHref(next, jobId));
      }}
      className="max-w-sm"
    />
  );
}

interface RoomLobbyProps {
  skill: SkillSlug;
  jobId?: string | undefined;
  room: PracticeRoomControls;
  /** The student's sessions left, and which kind of partner the api says is answering. */
  quota: PracticeQuotaLoad;
}

/**
 * Before the call: what it is, how many sessions are left, and the Start button. Nothing starts
 * until the student clicks it, because every start uses a session.
 */
export function RoomLobby({ skill, jobId, room, quota }: RoomLobbyProps) {
  const { user, refresh } = useSession();
  const needsConsent = user?.practiceConsentAt == null;
  // The notice opens by itself while it's needed; after "Not now", Start opens it again.
  const [consentWanted, setConsentOpen] = useState(true);
  const consentOpen = needsConsent && consentWanted;
  const { title, summary, weighted } = getSkill(skill);
  const weightedName = RUBRIC_DIMENSIONS.find((dimension) => dimension.key === weighted)?.name;
  const unverified = user?.emailVerifiedAt == null;
  const outOfSessions = quota.state === "ready" && !quota.data.available;
  const { status, error } = room.state;

  async function begin() {
    if (needsConsent) {
      setConsentOpen(true);
      return;
    }
    const failure = await room.start();
    if (failure === "consent_required") {
      // The session we hold says otherwise; ask again and the notice opens.
      setConsentOpen(true);
      void refresh();
    }
    if (failure !== null) quota.reload();
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card as="section" aria-labelledby="lobby-title" className="flex flex-col gap-6 md:p-8">
        <Link
          href={practiceHref(undefined, jobId)}
          className="pp-link inline-flex items-center gap-1.5 self-start rounded-control text-small font-semibold text-primary"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          All skills
        </Link>
        <div className="flex flex-col gap-3">
          <h2 id="lobby-title" className="text-h2 text-navy">
            {title}
          </h2>
          <p className="text-lede text-ink">{summary}</p>
        </div>

        {jobId && (
          <div className="flex flex-col gap-4 rounded-control bg-surface-2 p-4">
            <p className="text-ink">
              This call is set up around the job you were looking at. Your partner is someone that
              job would put you in front of.
            </p>
            <SkillSwitch skill={skill} jobId={jobId} />
          </div>
        )}

        <p className="max-w-prose text-ink">
          Your partner opens the call. You get up to {LIMITS.maxStudentTurns} turns and{" "}
          {SESSION_MINUTES} minutes, talking or typing. When you end it, the scorecard quotes what
          you actually said. {weightedName} counts double in this call’s score.
        </p>

        <ActiveSession />

        {status === "error" && error && (
          <p role="alert" className="font-semibold text-danger">
            {error.message}
          </p>
        )}
        {unverified && (
          <p className="text-ink">
            Confirm your email to start a call. The banner at the top can send you a new link.
          </p>
        )}
        {needsConsent && !consentOpen && (
          <p className="text-ink">
            You’ll see a short notice about how practice works before your first call.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Button
            size="lg"
            loading={status === "starting"}
            disabled={unverified || outOfSessions}
            onClick={() => void begin()}
          >
            Start the call
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
          <Link href={lessonPath(skill)} className={TEXT_LINK}>
            Read the lesson first
          </Link>
        </div>
        <p className="max-w-prose text-small text-muted">
          Starting uses one of today’s sessions.{" "}
          {quota.partner === "scripted" && `${SCRIPTED_PARTNER_NOTICE} `}
          {VOICE_DISCLOSURE}{" "}
          <Link href="/privacy" className={TEXT_LINK}>
            Privacy
          </Link>
        </p>
      </Card>

      <Card as="aside" aria-labelledby="lobby-quota" className="flex flex-col gap-4">
        <h2 id="lobby-quota" className="text-h4">
          Your sessions
        </h2>
        {quota.state === "loading" && <Loading label="Loading your sessions" lines={2} />}
        {quota.state === "error" && <LoadError what="your sessions" onRetry={quota.reload} />}
        {quota.state === "ready" && <QuotaMeter quota={quota.data} />}
        <Link href={historyHref()} className={TEXT_LINK}>
          Your past sessions
        </Link>
      </Card>

      <ConsentDialog
        partner={quota.partner}
        open={consentOpen}
        onClose={() => {
          setConsentOpen(false);
        }}
        onAccepted={() => {
          setConsentOpen(false);
        }}
      />
    </div>
  );
}
