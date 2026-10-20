import type { PracticeQuota } from "@pitchperfect/shared";
import { cn } from "@/lib/cn";
import { formatResetTime } from "@/lib/local-time";

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

/** Practice sessions used today and this month, and when the daily count starts over. */
export function QuotaMeter({ quota }: { quota: PracticeQuota }) {
  const { dailyUsed, dailyLimit, monthlyUsed, monthlyLimit } = quota;
  const monthFull = monthlyUsed >= monthlyLimit;
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
      <p className="text-small text-muted">
        {monthFull
          ? "You’ve used this month’s sessions. The count starts over on the 1st."
          : `The daily count starts over ${formatResetTime(quota.resetsAt)}.`}
      </p>
    </div>
  );
}
