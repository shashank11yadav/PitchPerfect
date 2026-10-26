"use client";

import { LIMITS, type PracticePartnerKind } from "@pitchperfect/shared";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { ApiError, apiFetch } from "@/lib/api";
import { useSession } from "@/lib/session";
import { formMessage } from "@/lib/use-form";

interface ConsentDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called once the api has stored the acceptance and the session shows it. */
  onAccepted: () => void;
  /** What answers the call: a live model (the default) or the scripted demo partner. */
  partner?: PracticePartnerKind;
  /**
   * The student accepted an earlier notice, for another kind of partner or before the kind was
   * kept, so this one asks again.
   */
  renewal?: boolean;
  /** The api says another partner answers now than the one this notice describes. */
  onPartnerChanged?: () => void;
}

/**
 * The one-time practice notice (docs/security.md, Age and consent): who the partner really is
 * (an AI model, the scripted demo on our server, or the scripted demo in this browser), where
 * transcripts go and how long they're kept, and what the browser does with your voice.
 */
export function ConsentDialog({
  open,
  onClose,
  onAccepted,
  partner = "live",
  renewal = false,
  onPartnerChanged,
}: ConsentDialogProps) {
  const { refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  async function accept() {
    setBusy(true);
    setProblem("");
    try {
      await apiFetch("/me/practice-consent", { method: "POST", body: { accepted: true, partner } });
      await refresh();
      onAccepted();
    } catch (error) {
      if (error instanceof ApiError && error.code === "conflict") {
        // The partner changed while the notice was open: show the notice for the new one.
        onPartnerChanged?.();
        setProblem("Your practice partner just changed, so this notice has too. Read it again.");
      } else {
        setProblem(formMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={renewal ? "Before your next practice call" : "Before your first practice call"}
      // The privacy link sits up here, so the first control in the body is a button in the pinned
      // bar: the notice opens on its heading with focus on "Not now", not scrolled to its end.
      description={
        <>
          {renewal
            ? "This notice has changed since you accepted it. Read it again before you go on."
            : "Three things to know. You’ll only see this once."}{" "}
          The details are in our{" "}
          <Link href="/privacy" className="pp-link rounded-control font-semibold text-primary">
            privacy policy
          </Link>
          .
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <ul className="flex flex-col gap-4 text-ink">
          {partner !== "live" && (
            <li>
              <strong className="font-semibold">Your practice partner is scripted.</strong> It plays
              a buyer with a made-up name and job from a fixed set of lines, and it scores the call
              when you end it.
            </li>
          )}
          {partner === "scripted" && (
            <li>
              <strong className="font-semibold">Your text stays with us.</strong> The scripted
              partner runs on our own server. Transcripts and scorecards are kept for{" "}
              {LIMITS.attemptRetentionDays} days, and you can delete any of them sooner.
            </li>
          )}
          {partner === "browser" && (
            <li>
              <strong className="font-semibold">Everything runs in this browser tab.</strong> The
              partner and the scorer run here, typed text never leaves the page, and your sessions
              stay in this tab until you close it.
            </li>
          )}
          {partner === "live" && (
            <>
              <li>
                <strong className="font-semibold">Your practice partner is an AI.</strong> It plays
                a buyer with a made-up name and job, and it scores the call when you end it.
              </li>
              <li>
                <strong className="font-semibold">
                  What you say goes to an AI provider as text.
                </strong>{" "}
                We send your turns to the provider that runs the partner. Transcripts and scorecards
                are kept for {LIMITS.attemptRetentionDays} days, and you can delete any of them
                sooner.
              </li>
            </>
          )}
          <li>
            <strong className="font-semibold">
              Talking uses your browser’s speech recognition.
            </strong>{" "}
            Your browser may send the audio to Google, Apple, or Microsoft to turn it into text.
            PitchPerfect never receives or stores audio, and you can type every turn instead.
          </li>
        </ul>
        <p role="alert" className="text-small text-danger empty:sr-only">
          {problem}
        </p>
        <ModalActions>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Not now
          </Button>
          <Button loading={busy} onClick={() => void accept()}>
            I understand
          </Button>
        </ModalActions>
      </div>
    </Modal>
  );
}
