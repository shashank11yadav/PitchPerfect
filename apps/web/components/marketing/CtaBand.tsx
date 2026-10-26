import { InView, InViewItem } from "@/components/motion/in-view";
import { cn } from "@/lib/cn";
import { CtaLinks, type CtaLink } from "./CtaLinks";
import { WRAP } from "./Section";

interface CtaBandProps {
  title?: string;
  body?: string;
  primary?: CtaLink;
  secondary?: CtaLink;
}

/** The close of every public page: one field of brand blue, the only place it fills a band. */
export function CtaBand({
  title = "Practice the call before it counts",
  body = "Pick a skill, talk it through with the practice partner, and read your scorecard. Apply when you're ready.",
  primary,
  secondary,
}: CtaBandProps) {
  return (
    <section aria-labelledby="cta-heading" className="pp-on-dark bg-primary text-white">
      <InView
        className={cn(WRAP, "grid gap-y-10 py-20 md:py-28 lg:grid-cols-12 lg:items-end lg:gap-x-6")}
      >
        <InViewItem className="lg:col-span-7">
          <h2 id="cta-heading" className="max-w-[15ch] text-title text-white">
            {title}
          </h2>
        </InViewItem>
        <InViewItem className="lg:col-span-4 lg:col-start-9">
          <p className="max-w-[40ch] text-lede text-white">{body}</p>
          <CtaLinks className="mt-8" primary={primary} secondary={secondary} />
        </InViewItem>
      </InView>
    </section>
  );
}
