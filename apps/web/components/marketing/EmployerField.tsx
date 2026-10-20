import Link from "next/link";
import { InView, InViewItem } from "@/components/motion/in-view";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { ApplicantsPreview } from "./ApplicantsPreview";
import { WRAP } from "./Section";

const POINTS = [
  "Scorecards arrive with the quotes behind every score.",
  "Move people from applied to shortlisted, interview and hired.",
  "Send interview invites with a time and a meeting link.",
  "Get a verified badge when your work email matches your website.",
];

/** The home page's employer pitch on a navy field: the employer's own view beside the claim. */
export function EmployerField() {
  return (
    <section aria-labelledby="for-employers-heading" className="pp-on-dark bg-navy text-white">
      <InView className={cn(WRAP, "grid gap-y-10 py-20 md:py-32 lg:grid-cols-12 lg:gap-x-6")}>
        <InViewItem className="lg:col-span-5 lg:col-start-8 lg:row-start-1">
          <h2 id="for-employers-heading" className="max-w-[13ch] text-title text-white">
            Hire the ones who practiced
          </h2>
        </InViewItem>
        <InViewItem className="min-w-0 lg:col-span-6 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:self-center">
          <ApplicantsPreview />
        </InViewItem>
        <InViewItem className="lg:col-span-5 lg:col-start-8 lg:row-start-2">
          <p className="max-w-[38ch] text-lede text-white">
            Post entry-level sales roles for free. Applicants can attach a scorecard from a practice
            call, so you can see how they handled a buyer before you book an interview.
          </p>
          <ul className="mt-8 flex flex-col gap-3 text-white">
            {POINTS.map((point) => (
              <li key={point} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-2.5 h-1 w-4 shrink-0 rounded-pill bg-white"
                />
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-4">
            <Link
              href="/signup/employer"
              className={buttonClasses({ variant: "inverse", size: "lg" })}
            >
              Post a job
            </Link>
            <Link
              href="/employers"
              className="pp-link rounded-control py-2 font-semibold text-white"
            >
              More for employers
            </Link>
          </div>
        </InViewItem>
      </InView>
    </section>
  );
}
