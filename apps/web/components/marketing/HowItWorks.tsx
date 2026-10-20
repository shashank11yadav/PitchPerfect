import { BookOpen, Briefcase, Mic } from "lucide-react";
import { cn } from "@/lib/cn";
import { Section, SectionHeading } from "./Section";

const STEPS = [
  {
    icon: BookOpen,
    title: "Learn",
    body: "Read a short lesson for each of eight sales skills, with a simple framework, a worked example and the mistakes to avoid.",
  },
  {
    icon: Mic,
    title: "Practice",
    body: "Talk it through with an AI practice partner that plays a realistic buyer. It pushes back on weak answers and warms up when you do well.",
  },
  {
    icon: Briefcase,
    title: "Get hired",
    body: "Get a scorecard that quotes your own words, then apply to sales roles and share your best scorecard with the employer.",
  },
] as const;

interface HowItWorksProps {
  tone?: "white" | "muted";
}

/** Learn → Practice → Get hired, as three numbered steps. */
export function HowItWorks({ tone = "white" }: HowItWorksProps) {
  return (
    <Section tone={tone} labelledBy="how-it-works-heading">
      <SectionHeading
        id="how-it-works-heading"
        eyebrow="How it works"
        title="Learn it, practice it, then get hired for it"
        lead="Three steps, at your own pace. Start with a lesson, or jump straight into practice."
        align="center"
      />
      <ol className="relative mt-12 grid gap-6 md:grid-cols-3 md:gap-8">
        <span
          aria-hidden="true"
          className="absolute top-7 right-[16%] left-[16%] hidden border-t-2 border-dashed border-primary/30 md:block"
        />
        {STEPS.map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="relative flex flex-col items-center text-center">
            <span
              className={cn(
                "relative flex size-14 items-center justify-center rounded-pill bg-primary text-white shadow-card ring-8",
                tone === "muted" ? "ring-surface-2" : "ring-surface",
              )}
            >
              <Icon aria-hidden="true" className="size-6" />
              <span className="absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-pill bg-navy text-caption font-bold text-white">
                {index + 1}
              </span>
            </span>
            <h3 className="mt-5 text-h4">{title}</h3>
            <p className="mt-2 max-w-xs text-ink">{body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
