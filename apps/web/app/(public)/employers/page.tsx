import { InView, InViewItem } from "@/components/motion/in-view";
import { EMPLOYER_PIPELINE, ApplicantsPreview } from "@/components/marketing/ApplicantsPreview";
import { CtaBand } from "@/components/marketing/CtaBand";
import { CtaLinks } from "@/components/marketing/CtaLinks";
import {
  InviteFragment,
  JobPostFragment,
  ListingsFragment,
} from "@/components/marketing/fragments";
import { PageHero } from "@/components/marketing/Hero";
import { Section, SectionTitle } from "@/components/marketing/Section";
import { StatementRows, type Statement } from "@/components/marketing/StatementRows";
import { pageMetadata, PUBLIC_PAGES } from "@/lib/seo";

export const metadata = pageMetadata(PUBLIC_PAGES.employers);

const FEATURES: Statement[] = [
  {
    title: "Post a role",
    body: "Write the description, list the skills, set the pay and the workplace, and publish when you’re ready. Drafts stay private.",
  },
  {
    title: "Candidates rehearse your role",
    body: "Students can start a practice call from your listing, built from its title, description and skills.",
  },
  {
    title: "Scorecards with quotes",
    body: "When an applicant shares a scorecard, you see the scores, the reasons, and the lines they came from.",
  },
  {
    title: "A short pipeline",
    body: "Move people from applied to shortlisted, interview and hired, or mark them not a fit. Save the ones you want to come back to.",
  },
  {
    title: "Interview invites",
    body: "Pick a time and add a meeting link. The candidate gets an email and sees the interview in their applications.",
  },
  {
    title: "A verified badge",
    body: "Confirm a work email on your company’s domain and your listings show as verified, to candidates and to search engines.",
  },
];

const VERIFY_STEPS = [
  "Sign up with your work email, and add your company’s name and website.",
  "Confirm the email with the one-time link we send. Free, throwaway and alias email providers never count as a company domain.",
  "If the email’s domain matches the website’s, you’re verified, and your badge names that domain. Unverified listings still go live, with a badge.",
];

/** Each step starts further in than the last, so the three read as a sequence without numbers. */
const STEP_INDENTS = ["", "lg:ml-[12%]", "lg:ml-[24%]"];

export default function EmployersPage() {
  return (
    <>
      <PageHero
        title="Hire people who practiced the job"
        lead={
          <p>
            Post entry-level sales roles and review applicants with their résumé and, when they
            choose to share it, a scorecard from a practice call.
          </p>
        }
        actions={
          <CtaLinks
            primary={{ href: "/signup/employer", label: "Post a job" }}
            secondary={{ href: "/how-it-works", label: "How practice works" }}
          />
        }
      />

      <Section labelledBy="review-heading">
        <div className="grid items-center gap-y-14 lg:grid-cols-12 lg:gap-x-6">
          <InView className="min-w-0 lg:col-span-6">
            <InViewItem>
              <ApplicantsPreview pipeline={EMPLOYER_PIPELINE} />
            </InViewItem>
          </InView>
          <InView className="lg:col-span-5 lg:col-start-8">
            <InViewItem>
              <SectionTitle id="review-heading" size="title">
                Read how they handle a buyer
              </SectionTitle>
            </InViewItem>
            <InViewItem>
              <p className="mt-6 max-w-[42ch] text-lede text-ink">
                A shared scorecard links to the candidate’s practice session. If they delete that
                session or withdraw, it stops being shared. Résumés download as PDF files and never
                open in the browser.
              </p>
            </InViewItem>
          </InView>
        </div>
      </Section>

      <Section ground="soft" labelledBy="features-heading">
        <SectionTitle id="features-heading">From posting to interview</SectionTitle>
        <p className="mt-4 max-w-[52ch] text-lede text-ink">
          What you need for an entry-level sales hire, without a separate tracker.
        </p>
        <div className="mt-12 grid items-start gap-y-12 md:mt-16 lg:grid-cols-12 lg:gap-x-6">
          <StatementRows items={FEATURES} layout="pinned" className="lg:col-span-6" />
          {/* The invite sits lower than the post, the order they happen in, so the two cards run
              the length of the list beside them. */}
          <InView className="order-first grid max-w-md gap-4 lg:order-none lg:col-span-5 lg:col-start-8 lg:gap-0">
            <InViewItem>
              <JobPostFragment />
            </InViewItem>
            <InViewItem className="lg:mt-40 lg:ml-12">
              <InviteFragment />
            </InViewItem>
          </InView>
        </div>
      </Section>

      <Section labelledBy="verify-heading">
        <div className="grid items-start gap-y-12 lg:grid-cols-12 lg:gap-x-6">
          <div className="lg:col-span-7 lg:col-start-6 lg:row-start-1">
            <SectionTitle id="verify-heading">How verification works</SectionTitle>
            <p className="mt-4 max-w-[52ch] text-lede text-ink">
              It’s an automatic domain check. It tells candidates the person posting really has a
              company email. It doesn’t mean we vouch for the job.
            </p>
            <InView as="ol" className="mt-10 flex flex-col gap-4">
              {VERIFY_STEPS.map((step, index) => (
                <InViewItem
                  key={step}
                  as="li"
                  className={`max-w-xl rounded-[20px] bg-primary-soft p-6 text-statement text-navy md:p-8 ${STEP_INDENTS[index] ?? ""}`}
                >
                  {step}
                </InViewItem>
              ))}
            </InView>
          </div>
          <InView className="min-w-0 lg:col-span-4 lg:col-start-1 lg:row-start-1 lg:pt-3">
            <InViewItem>
              <p className="mb-4 text-small font-semibold text-ink">What candidates see</p>
              <ListingsFragment />
            </InViewItem>
          </InView>
        </div>
      </Section>

      <CtaBand
        title="Post your first sales role"
        body="Create an employer account, post a role, and review applicants who’ve practiced the call."
        primary={{ href: "/signup/employer", label: "Post a job" }}
        secondary={{ href: "/jobs", label: "See current jobs" }}
      />
    </>
  );
}
