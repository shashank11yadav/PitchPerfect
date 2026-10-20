import { WRAP } from "@/components/marketing/Section";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

const ROWS = 4;

/** Shown while the board or a job loads: the page's grounds, with the list's rows sketched in. */
export default function JobsLoading() {
  return (
    <div>
      <p role="status" className="sr-only">
        Loading jobs
      </p>
      <div className="bg-navy">
        <div className={cn(WRAP, "pt-14 pb-16 md:pt-24 md:pb-24")}>
          <div
            aria-hidden="true"
            className="h-14 w-full max-w-xl animate-pulse rounded-control bg-white/15 motion-reduce:animate-none md:h-20"
          />
        </div>
      </div>
      <div className="bg-surface">
        <ul className={cn(WRAP, "divide-y divide-border py-14 md:py-20")}>
          {Array.from({ length: ROWS }, (_, index) => (
            <li key={index} className="grid gap-y-4 py-8 lg:grid-cols-12 lg:gap-x-6">
              <div className="flex flex-col gap-3 lg:col-span-7">
                <Skeleton className="h-8 w-4/5 max-w-lg" />
                <Skeleton className="h-5 w-56" />
              </div>
              <div className="flex flex-col gap-2 lg:col-span-4 lg:col-start-9">
                <Skeleton className="h-6 w-60" />
                <Skeleton className="h-5 w-32" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
