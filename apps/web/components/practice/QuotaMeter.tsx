import type { PracticeQuota } from "@pitchperfect/shared";
import { cn } from "@/lib/cn";
import { formatMonthlyReset, formatResetTime } from "@/lib/local-time";

function Bar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const share = limit > 0 ? Math.min(1, used / limit) : 1;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-ink">{label}</p>
      {/* The sentence above carries the numbers; the bar is the same thing drawn. */}
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-pill bg-border">
        <div
          className={cn("h-full rounded-pill", used >= limit ? "bg-warning" : "bg-primary")}
          style={{ width: `${String(share * 100)}%` }}
        />
      </div>
    </div>
  );
}

/** The line under the bars: when sessions come back, or why there are none right now. */
function resetNote(quota: PracticeQuota): string {
  const { dailyUsed, dailyLimit, monthlyUsed, monthlyLimit, budgetExhausted, resetsAt } = quota;
  if (monthlyUsed >= monthlyLimit) {
    return `You’ve used this month’s sessions. They start over ${formatMonthlyReset()}.`;
  }
  // Today's practice budget for everyone is spent, whatever this student has left.
  if (budgetExhausted) {
    return `Practice is paused for today. It opens again ${formatResetTime(resetsAt)}.`;
  }
  if (dailyUsed >= dailyLimit) {
    return `You’ve used today’s sessions. The count starts over ${formatResetTime(resetsAt)}.`;
  }
  return `The daily count starts over ${formatResetTime(resetsAt)}.`;
}

/** Practice sessions used today and this month, and when they come back. */
export function QuotaMeter({ quota }: { quota: PracticeQuota }) {
  const { dailyUsed, dailyLimit, monthlyUsed, monthlyLimit } = quota;
  return (
    <div className="flex flex-col gap-4">
      <Bar
        label={`${String(dailyUsed)} of ${String(dailyLimit)} today`}
        used={dailyUsed}
        limit={dailyLimit}
      />
      <Bar
        label={`${String(monthlyUsed)} of ${String(monthlyLimit)} this month`}
        used={monthlyUsed}
        limit={monthlyLimit}
      />
      <p className="text-small text-muted">{resetNote(quota)}</p>
    </div>
  );
}
