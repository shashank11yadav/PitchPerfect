"use client";

import { useState, type ReactNode } from "react";
import { formMessage } from "@/lib/use-form";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** Runs on confirm; the dialog closes when it resolves and says what went wrong if it throws. */
  onConfirm: () => Promise<void>;
  /** "primary" for a final step that isn't destructive, like marking someone hired. */
  tone?: "danger" | "primary";
  /** Wording for api error codes, as in `useZodForm`. */
  apiMessages?: Record<string, string>;
}

/** "Are you sure?" for actions that can't be undone. The safe choice gets focus first. */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  tone = "danger",
  apiMessages,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const close = () => {
    if (busy) return;
    setProblem("");
    onClose();
  };

  async function confirm() {
    setBusy(true);
    setProblem("");
    try {
      await onConfirm();
      setBusy(false);
      onClose();
    } catch (error) {
      setBusy(false);
      setProblem(formMessage(error, apiMessages));
    }
  }

  return (
    <Modal open={open} onClose={close} title={title} description={description}>
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-danger empty:hidden">
          {problem}
        </p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone} loading={busy} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
