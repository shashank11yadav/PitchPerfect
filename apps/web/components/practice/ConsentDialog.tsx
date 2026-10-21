"use client";

import { LIMITS } from "@pitchperfect/shared";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/session";
import { formMessage } from "@/lib/use-form";

interface ConsentDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called once the api has stored the acceptance and the session shows it. */
  onAccepted: () => void;
}

/**
 * The one-time practice notice (docs/security.md, Age and consent): the partner is an AI, where
 * transcripts go and how long they're kept, and what the browser does with your voice.
 */
export function ConsentDialog({ open, onClose, onAccepted }: ConsentDialogProps) {
  const { refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  async function accept() {
    setBusy(true);
    setProblem("");
    try {
      await apiFetch("/me/practice-consent", { method: "POST", body: { accepted: true } });
      await refresh();
      onAccepted();
    } catch (error) {
      setProblem(formMessage(error));
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
      title="Before your first practice call"
      description="Three things to know. You’ll only see this once."
    >
      <div className="flex flex-col gap-5">
        <ul className="flex flex-col gap-4 text-ink">
          <li>
            <strong className="font-semibold">Your practice partner is an AI.</strong> It plays a
            buyer with a made-up name and job, and it scores the call when you end it.
          </li>
          <li>
            <strong className="font-semibold">What you say goes to an AI provider as text.</strong>{" "}
            We send your turns to the provider that runs the partner. Transcripts and scorecards are
            kept for {LIMITS.attemptRetentionDays} days, and you can delete any of them sooner.
          </li>
          <li>
            <strong className="font-semibold">
              Talking uses your browser’s speech recognition.
            </strong>{" "}
            Your browser may send the audio to Google, Apple, or Microsoft to turn it into text.
            PitchPerfect never receives or stores audio, and you can type every turn instead.
          </li>
        </ul>
        <p className="text-small text-ink">
          The details are in our{" "}
          <Link href="/privacy" className="pp-link rounded-control font-semibold text-primary">
            privacy policy
          </Link>
          .
        </p>
        <p role="alert" className="text-small text-danger empty:sr-only">
          {problem}
        </p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Not now
          </Button>
          <Button loading={busy} onClick={() => void accept()}>
            I understand
          </Button>
        </div>
      </div>
    </Modal>
  );
}
