import { EMPLOYMENT_TYPES, LIMITS, WORKPLACES } from "@pitchperfect/shared";
import { Search } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EMPLOYMENT_TYPE_LABELS, WORKPLACE_LABELS } from "@/lib/job-labels";
import { hasFilters, type JobQuery } from "@/lib/job-query";
import { formAction } from "@/lib/pages-export";

/**
 * The board's search, as a plain GET form: it works without JavaScript, and the URL it produces
 * is what the server renders (the static demo reads it in the browser). A new search starts again
 * from page 1. `action` is the board's route; the form itself gets the address the host serves.
 */
export function JobFilters({ query, action = "/jobs" }: { query: JobQuery; action?: string }) {
  return (
    <form
      role="search"
      aria-label="Search jobs"
      method="get"
      action={formAction(action)}
      className="grid grid-cols-2 gap-x-4 gap-y-3 sm:gap-x-6 md:gap-y-5 lg:grid-cols-12 lg:items-end"
    >
      <Field label="Search" className="col-span-2 lg:col-span-5">
        <Input
          type="search"
          name="q"
          defaultValue={query.q ?? ""}
          maxLength={LIMITS.jobSearchMaxLength}
          placeholder="Job title or skill, like discovery"
          autoComplete="off"
        />
      </Field>
      <Field label="Workplace" className="lg:col-span-2">
        <Select name="workplace" defaultValue={query.workplace ?? ""}>
          <option value="">Any</option>
          {WORKPLACES.map((value) => (
            <option key={value} value={value}>
              {WORKPLACE_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Job type" className="lg:col-span-2">
        <Select name="employmentType" defaultValue={query.employmentType ?? ""}>
          <option value="">Any</option>
          {EMPLOYMENT_TYPES.map((value) => (
            <option key={value} value={value}>
              {EMPLOYMENT_TYPE_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="col-span-2 flex flex-wrap items-center gap-x-6 gap-y-3 lg:col-span-3">
        <button type="submit" className={buttonClasses()}>
          <Search aria-hidden="true" className="size-4" />
          Search
        </button>
        {hasFilters(query) && (
          <Link href={action} className="pp-link rounded-control py-2 font-semibold text-primary">
            Clear filters
          </Link>
        )}
      </div>
    </form>
  );
}
