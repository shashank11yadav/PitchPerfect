import { BadgeCheck, CalendarClock, ClipboardList, FilePenLine, Mic, Quote } from "lucide-react";
import { CtaBand } from "@/components/marketing/CtaBand";
import { CtaLinks } from "@/components/marketing/CtaLinks";
import { FeatureGrid, type Feature } from "@/components/marketing/FeatureGrid";
import { ApplicantsPreview } from "@/components/marketing/ForEmployers";
import { Hero } from "@/components/marketing/Hero";
import { Section, SectionHeading } from "@/components/marketing/Section";
import { pageMetadata, PUBLIC_PAGES } from "@/lib/seo";

export const metadata = pageMetadata(PUBLIC_PAGES.employers);

const FEATURES: Feature[] = [
  {
    icon: FilePenLine,
    title: "Post a role",
    body: "Write the description, list the skills, set the pay and the workplace, and publish when you are ready. Drafts stay private.",
  },
  {
    icon: Mic,
    title: "Candidates practice your role",
    body: "Students can start a practice session from your listing, built from its title, description and skills.",
  },
  {
    icon: Quote,
    title: "Scorecards with evidence",
    body: "When an applicant shares a scorecard, you see the rubric scores, the reasons and the quotes they came from.",
  },
  {
    icon: ClipboardList,
    title: "A simple pipeline",
    body: "Move each applicant from applied to shortlisted, interview, and hired or rejected, and save the ones to revisit.",
  },
  {
    icon: CalendarClock,
    title: "Interview invites",
    body: "Pick a time and add a meeting link. The candidate gets an email and sees the interview in their applications.",
  },
  {
    icon: BadgeCheck,
    title: "A verified badge",
    body: "Confirm a work email on your company's domain and your listings show as verified to candidates and to search engines.",
  },
];

const VERIFY_STEPS = [
  {
    title: "Sign up with your work email",
    body: "Add your company's name and website when you create the account.",
  },
  {
    title: "Confirm the email",
    body: "We send a one-time link. Free email providers never count as a company domain.",
  },
  {
    title: "Domains match, you are verified",
    body: "If your email's domain matches your website's, the company is verified. Unverified listings still appear, with a badge.",
  },
];

export default function EmployersPage() {
  return (
    <>
      <Hero
        compact
        eyebrow="For employers"
        title="Meet sales candidates who have already practiced"
        lead={
          <p>
            Post entry-level sales roles and review applicants with their résumé and, when they
            choose to share it, a scorecard from a practice conversation.
          </p>
        }
        actions={
          <CtaLinks
            primary={{ href: "/signup/employer", label: "Post a job" }}
            secondary={{ href: "/how-it-works", label: "How practice works" }}
          />
        }
      />

      <Section labelledBy="features-heading">
        <SectionHeading
          id="features-heading"
          title="From posting to interview in one place"
          lead="Everything you need to run an entry-level sales hire, without a separate tracker."
        />
        <FeatureGrid items={FEATURES} className="mt-10" />
      </Section>

      <Section tone="muted" labelledBy="review-heading">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <SectionHeading
            id="review-heading"
            title="See how a candidate handles a buyer"
            lead="A shared scorecard is a live link to the candidate's practice session. If they delete that session or withdraw, it is no longer shared. Résumés download as PDF files and are never shown in the browser."
          />
          <ApplicantsPreview />
        </div>
      </Section>

      <Section labelledBy="verify-heading">
        <SectionHeading
          id="verify-heading"
          title="How company verification works"
          lead="Verification is an automatic domain check. It tells candidates that the person posting really uses the company's email, not that we vouch for the job."
        />
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {VERIFY_STEPS.map(({ title, body }, index) => (
            <li
              key={title}
              className="rounded-card border border-border bg-surface p-6 shadow-card"
            >
              <span className="flex size-9 items-center justify-center rounded-pill bg-primary-soft font-display font-bold text-primary">
                {index + 1}
              </span>
              <h3 className="mt-4 text-h4">{title}</h3>
              <p className="mt-2 text-ink">{body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <CtaBand
        title="Ready to meet your next sales hire?"
        body="Create an employer account, post a role, and start reviewing applicants who have practiced the conversation."
        primary={{ href: "/signup/employer", label: "Post a job" }}
        secondary={{ href: "/jobs", label: "See current jobs" }}
      />
    </>
  );
}
