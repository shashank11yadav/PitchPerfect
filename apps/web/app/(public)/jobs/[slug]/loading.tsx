import { WRAP } from "@/components/marketing/Section";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

/** Shown while one job loads: its title band, then the description beside the facts column. */
export default function JobLoading() {
  return (
    <div>
      <p role="status" className="sr-only">
        Loading the job
      </p>
      <div className="bg-navy">
        <div className={cn(WRAP, "flex flex-col gap-5 pt-14 pb-16 md:pt-24 md:pb-24")}>
          <span
            aria-hidden="true"
            className="block h-12 w-full max-w-2xl animate-pulse rounded-control bg-white/15 motion-reduce:animate-none md:h-16"
          />
          <span
            aria-hidden="true"
            className="block h-6 w-64 animate-pulse rounded-control bg-white/15 motion-reduce:animate-none"
          />
        </div>
      </div>
      <div className={cn(WRAP, "grid gap-y-10 py-14 md:py-20 lg:grid-cols-12 lg:gap-x-6")}>
        <div className="flex flex-col gap-3 lg:col-span-7">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="mt-6 h-5 w-2/3" />
          <Skeleton className="h-5 w-3/4" />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-4 lg:col-start-9">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-5 w-40" />
        </div>
      </div>
    </div>
  );
}
