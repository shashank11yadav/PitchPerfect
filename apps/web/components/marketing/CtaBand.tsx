import { CtaLinks, type CtaLink } from "./CtaLinks";
import { Section } from "./Section";

interface CtaBandProps {
  title?: string;
  body?: string;
  tone?: "white" | "muted";
  primary?: CtaLink;
  secondary?: CtaLink;
}

/** The closing call to action on public pages. */
export function CtaBand({
  title = "Practice the conversation before it counts",
  body = "Pick a skill, talk it through with the AI practice partner, and see your scorecard. When you are ready, apply.",
  tone = "muted",
  primary,
  secondary,
}: CtaBandProps) {
  return (
    <Section tone={tone} labelledBy="cta-heading">
      <div className="pp-on-dark relative isolate overflow-hidden rounded-[24px] bg-linear-to-br from-primary to-navy px-6 py-12 text-center md:px-12 md:py-16">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 size-full"
          preserveAspectRatio="xMidYMid slice"
          viewBox="0 0 800 320"
        >
          <circle cx="720" cy="-20" r="180" fill="#ffffff" fillOpacity="0.07" />
          <circle cx="60" cy="340" r="160" fill="#ffffff" fillOpacity="0.06" />
        </svg>
        <h2 id="cta-heading" className="mx-auto max-w-2xl text-h3 text-white md:text-h2">
          {title}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-white/90 md:text-h4 md:font-normal">{body}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <CtaLinks primary={primary} secondary={secondary} />
        </div>
      </div>
    </Section>
  );
}
