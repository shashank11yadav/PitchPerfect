"use client";

import { LIMITS } from "@pitchperfect/shared";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, apiFetch } from "@/lib/api";
import { roleHome } from "@/lib/redirects";
import { useSession } from "@/lib/session";
import { formMessage } from "@/lib/use-form";
import { AUTH_LINK } from "./AuthCard";
import { DEAD_LINK_TITLE, DoneMessage, useForgetLinkToken } from "./form-parts";

type Phase = "checking" | "verified" | "invalid" | "failed";

/** For a signed-in user whose address isn't confirmed yet: one button and its outcome. */
function ResendLink({ email }: { email: string }) {
  const [sending, setSending] = useState(false);
  const [news, setNews] = useState("");

  async function resend() {
    setSending(true);
    setNews("");
    try {
      await apiFetch("/auth/resend-verification", { method: "POST" });
      setNews(`We sent a new link to ${email}.`);
    } catch (error) {
      setNews(formMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <Button size="lg" loading={sending} onClick={() => void resend()}>
        Send a new link
      </Button>
      <p role="status" className="text-body text-ink empty:hidden">
        {news}
      </p>
    </div>
  );
}

interface VerifyEmailStatusProps {
  /** From the emailed link's query string. */
  token: string | undefined;
}

/** Confirms the address in the emailed link as soon as the page opens, then says how it went. */
export function VerifyEmailStatus({ token }: VerifyEmailStatusProps) {
  useForgetLinkToken();
  const session = useSession();
  const { refresh } = session;
  const [phase, setPhase] = useState<Phase>(token ? "checking" : "invalid");
  const [problem, setProblem] = useState("");
  const [attempt, setAttempt] = useState(0);
  /** The attempt already sent. Strict mode runs effects twice; a token is only used once. */
  const sent = useRef(-1);
  const signedIn = session.status === "signed_in" ? session.user : undefined;
  /** Read when the answer arrives, which may be after the session has loaded. */
  const status = useRef(session.status);
  useEffect(() => {
    status.current = session.status;
  }, [session.status]);

  useEffect(() => {
    if (!token || sent.current === attempt) return;
    sent.current = attempt;
    apiFetch("/auth/verify-email", { method: "POST", body: { token } }).then(
      () => {
        setPhase("verified");
        // A signed-in user's `emailVerifiedAt` just changed. Nobody signed in: nothing to ask.
        if (status.current !== "signed_out") void refresh();
      },
      (error: unknown) => {
        if (error instanceof ApiError && error.code === "invalid_token") {
          setPhase("invalid");
        } else {
          setProblem(formMessage(error));
          setPhase("failed");
        }
      },
    );
  }, [token, attempt, refresh]);

  if (phase === "checking") {
    return (
      <div className="flex items-center gap-3 text-lede text-ink">
        <Spinner />
        <p role="status">Confirming your email</p>
      </div>
    );
  }

  if (phase === "verified") {
    return (
      <DoneMessage title="Your email is confirmed">
        <p className="text-lede text-ink">Thanks. That&apos;s all we needed.</p>
        {session.status !== "loading" && (
          <p>
            {signedIn ? (
              <Link href={roleHome(signedIn.role)} className={AUTH_LINK}>
                Go to your dashboard
              </Link>
            ) : (
              <Link href="/signin" className={AUTH_LINK}>
                Sign in
              </Link>
            )}
          </p>
        )}
      </DoneMessage>
    );
  }

  if (phase === "failed") {
    return (
      <DoneMessage title="We couldn't confirm your email">
        <p className="text-lede text-ink">{problem}</p>
        <div>
          <Button
            size="lg"
            onClick={() => {
              setPhase("checking");
              setAttempt((count) => count + 1);
            }}
          >
            Try again
          </Button>
        </div>
      </DoneMessage>
    );
  }

  let next;
  if (signedIn?.emailVerifiedAt) {
    next = (
      <>
        <p className="text-ink">Your email is already confirmed, so there&apos;s nothing to do.</p>
        <p>
          <Link href={roleHome(signedIn.role)} className={AUTH_LINK}>
            Go to your dashboard
          </Link>
        </p>
      </>
    );
  } else if (signedIn) {
    next = <ResendLink email={signedIn.email} />;
  } else if (session.status === "signed_out") {
    next = (
      <p className="text-ink">
        <Link href="/signin" className={AUTH_LINK}>
          Sign in
        </Link>{" "}
        and you can ask for a new link from your account.
      </p>
    );
  }

  return (
    <DoneMessage title={DEAD_LINK_TITLE}>
      <p className="text-lede text-ink">
        Confirmation links work once, for {LIMITS.verifyTokenHours} hours. A newer link also
        replaces any older ones.
      </p>
      {next}
    </DoneMessage>
  );
}
