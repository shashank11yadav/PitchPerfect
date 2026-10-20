import { cn } from "@/lib/cn";

export interface FilterOption<Value extends string> {
  value: Value;
  label: string;
  /** Shown after the label, e.g. how many jobs have this status. */
  count?: number | undefined;
}

interface FilterTabsProps<Value extends string> {
  /** Names the group for screen readers, e.g. "Job status". */
  label: string;
  options: readonly FilterOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  className?: string;
}

/**
 * A row of toggle buttons that filter one list (only one is pressed). Not WAI-ARIA tabs: there's
 * a single list under them, not one panel per tab.
 */
export function FilterTabs<Value extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: FilterTabsProps<Value>) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => {
            onChange(option.value);
          }}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-pill border px-3.5 text-small font-semibold",
            "border-border bg-surface text-ink hover:border-primary/40 hover:bg-primary-soft",
            "aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary",
          )}
        >
          <span>{option.label}</span>{" "}
          {option.count !== undefined && (
            <span className="min-w-5 rounded-pill bg-surface-2 px-1.5 text-center text-caption text-ink">
              {option.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
