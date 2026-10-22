"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { apiFetch } from "@/lib/api";
import { historyHref } from "@/lib/practice/paths";

/** Delete a practice session for good (after a confirm), then go to the history. */
export function DeleteAttempt({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className="pp-press inline-flex h-11 items-center gap-1.5 rounded-pill px-3 font-semibold text-danger hover:bg-danger/10"
      >
        <Trash2 aria-hidden="true" className="size-4" />
        Delete
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Delete this session?"
        description="The transcript and the scorecard are deleted for good, and any application sharing it stops."
        confirmLabel="Delete session"
        cancelLabel="Keep it"
        onConfirm={async () => {
          await apiFetch(`/practice/attempts/${attemptId}`, { method: "DELETE" });
          router.push(historyHref());
        }}
      />
    </>
  );
}
