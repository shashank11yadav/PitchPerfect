import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { PageHero } from "@/components/marketing/Hero";
import { Section, SectionTitle } from "@/components/marketing/Section";
import { buttonClasses } from "@/components/ui/Button";
import { REPO_URL } from "@/lib/site";

const LINK = "pp-link rounded-control font-semibold";

/** One line above the navbar on every page of the static demo: what works here, and where the rest is. */
export function DemoBanner() {
  return (
    <div className="bg-primary-soft text-ink">
      <p className="mx-auto w-full max-w-wide px-4 py-2.5 text-small sm:px-6 lg:px-8">
        This is a static demo: practice with a scripted partner and browse the job board here.
        Accounts and employer tools run in the full app, which can also use a live model from OpenAI
        or Anthropic;{" "}
        <a href={REPO_URL} className={`${LINK} text-primary`} rel="noopener noreferrer">
          the code is on GitHub
        </a>
        .
      </p>
    </div>
  );
}

type Area = "accounts" | "student" | "employer";

const COPY: Record<Area, { title: string; lead: string }> = {
  accounts: {
    title: "There’s nothing to sign in to here",
    lead: "This site is a static build on GitHub Pages: no server behind it, so no accounts, no email confirmation and nothing to reset. The practice room and the job board run in your browser.",
  },
  student: {
    title: "The student app isn’t part of this demo",
    lead: "The dashboard, saved jobs and applications need an account and a server, and this static build has neither. You can still run a practice call, look back at this tab’s sessions and read the job board.",
  },
  employer: {
    title: "The employer app isn’t part of this demo",
    lead: "Posting jobs and reviewing applicants need an account and a server, and this static build has neither. The job board shows the kind of roles employers post here.",
  },
};

const HERE = [
  "Practice calls by text or voice, scored at the end",
  "The eight lessons, one per skill",
  "The job board with its fictional listings",
  "Every public page",
];

const FULL_APP = [
  "Student and employer accounts, with email confirmation",
  "Applying, saving jobs and sharing a scorecard with an application",
  "Posting jobs and the applicant pipeline",
  "A live model from OpenAI or Anthropic as the partner, once you add an API key",
];

/** The page the static demo shows for sign-in, sign-up, the student app and the employer app. */
export function DemoUnavailable({ area }: { area: Area }) {
  const { title, lead } = COPY[area];
  return (
    <>
      <PageHero
        title={title}
        lead={<p>{lead}</p>}
        actions={
          <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
            <Link href="/practice" className={buttonClasses({ variant: "inverse", size: "lg" })}>
              Try a practice call
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link href="/jobs" className={`${LINK} py-2 text-white`}>
              Browse the jobs
            </Link>
          </div>
        }
      />
      <Section labelledBy="demo-scope" innerClassName="grid gap-y-10 lg:grid-cols-12 lg:gap-x-6">
        <div className="lg:col-span-5">
          <SectionTitle id="demo-scope">What this demo covers</SectionTitle>
          <p className="mt-6 max-w-[44ch] text-lede text-ink">
            The whole app, with its api and database, is in the repository. It runs on your machine
            with seeded demo data, and the README says how.
          </p>
          <a
            href={REPO_URL}
            rel="noopener noreferrer"
            className={`${LINK} mt-6 inline-flex items-center gap-1.5 text-primary`}
          >
            See the code on GitHub
            <ArrowRight aria-hidden="true" className="size-4" />
          </a>
        </div>
        <div className="grid gap-10 sm:grid-cols-2 lg:col-span-6 lg:col-start-7">
          <div>
            <h3 className="text-h4 text-navy">In the demo</h3>
            <ul className="mt-4 flex flex-col gap-3 text-ink">
              {HERE.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-h4 text-navy">In the full app</h3>
            <ul className="mt-4 flex flex-col gap-3 text-ink">
              {FULL_APP.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
    </>
  );
}
