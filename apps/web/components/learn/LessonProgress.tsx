"use client";

import type { SkillSlug } from "@pitchperfect/shared";
import { Check } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";
import { LessonsDone } from "@/lib/student-api";
import { useApi } from "@/lib/use-api";

/** "Mark as done" for one lesson: a toggle saved with `PUT /api/me/lessons/:skill`. */
export function LessonProgress({ skill }: { skill: SkillSlug }) {
  const lessons = useApi("/me/lessons", LessonsDone);
  /** Set once the student has toggled it here; until then, what the api said. */
  const [mine, setMine] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [news, setNews] = useState("");
  const done = mine ?? (lessons.state === "ready" && lessons.data.includes(skill));

  async function toggle() {
    const next = !done;
    setSaving(true);
    setNews("");
    try {
      const completed = await apiFetch(`/me/lessons/${skill}`, {
        method: "PUT",
        body: { completed: next },
        schema: LessonsDone,
      });
      setMine(completed.includes(skill));
      setNews(next ? "Marked as done." : "Marked as not done yet.");
    } catch {
      setNews("We couldn’t save that. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-pressed={done}
        disabled={lessons.state === "loading" || saving}
        aria-busy={saving || undefined}
        onClick={() => void toggle()}
        className={cn(
          "pp-press inline-flex h-11 items-center gap-2 self-start rounded-pill border px-5 font-semibold disabled:opacity-60",
          done
            ? "border-success bg-success/10 text-ink"
            : "border-primary bg-surface text-primary hover:bg-primary-soft",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex size-5 items-center justify-center rounded-pill border",
            done ? "border-success bg-success text-white" : "border-primary",
          )}
        >
          {done && <Check className="size-3.5" strokeWidth={3} />}
        </span>
        Mark as done
      </button>
      <p role="status" className="text-small text-ink empty:sr-only">
        {news}
      </p>
    </div>
  );
}
