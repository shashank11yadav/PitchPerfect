import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { InView, InViewItem } from "@/components/motion/in-view";
import { JobPostFragment, ScoredLineFragment } from "@/components/marketing/fragments";
import { PageHero } from "@/components/marketing/Hero";
import { Section, SectionTitle } from "@/components/marketing/Section";
import { buttonClasses } from "@/components/ui/Button";
import { SignedOutOnly } from "@/lib/session";
import { AUTH_PAGES, authPageMetadata } from "@/lib/seo";

export const metadata = authPageMetadata(AUTH_PAGES.signup);

/**
 * Two kinds of account, told apart by everything but a card: the student path on white with the
 * page's one button and a scored line from a practice call; the employer path on the soft blue,
 * mirrored, with a job post and a text link.
 */
export default function SignupPage() {
  return (
    <>
      <PageHero
        title="Who’s signing up?"
        lead={
          <>
            Students and employers get different accounts. Already have one?{" "}
            <Link href="/signin" className="pp-link rounded-control font-semibold text-white">
              Sign in
            </Link>
          </>
        }
      />
      <SignedOutOnly>
        <Section
          labelledBy="signup-student"
          innerClassName="grid gap-12 lg:grid-cols-12 lg:gap-x-6"
        >
          <InView className="flex flex-col gap-6 lg:col-span-6">
            <InViewItem>
              <SectionTitle id="signup-student">I’m a student or a recent graduate</SectionTitle>
            </InViewItem>
            <InViewItem>
              <p className="max-w-[44ch] text-lede text-ink">
                Practice sales calls out loud with the practice partner, read a scorecard that
                quotes what you said, and apply to entry-level jobs. It’s free, and it’s for people
                18 and older.
              </p>
            </InViewItem>
            <InViewItem>
              <Link
                href="/signup/student"
                className={buttonClasses({ size: "lg", className: "self-start" })}
              >
                Sign up as a student
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </InViewItem>
          </InView>
          <div className="lg:col-span-5 lg:col-start-8 lg:self-center">
            <ScoredLineFragment />
          </div>
        </Section>

        <Section
          ground="soft"
          labelledBy="signup-employer"
          innerClassName="grid gap-12 lg:grid-cols-12 lg:gap-x-6"
        >
          <div className="order-last lg:order-first lg:col-span-5 lg:self-center">
            <JobPostFragment />
          </div>
          <InView className="flex flex-col gap-6 lg:col-span-6 lg:col-start-7">
            <InViewItem>
              <SectionTitle id="signup-employer">I’m hiring for a sales role</SectionTitle>
            </InViewItem>
            <InViewItem>
              <p className="max-w-[44ch] text-lede text-ink">
                Post entry-level roles and read the scorecards applicants choose to share before you
                book an interview. Sign up with your work email so we can verify your company.
              </p>
            </InViewItem>
            <InViewItem>
              <Link
                href="/signup/employer"
                className="pp-link inline-flex items-center gap-2 self-start rounded-control py-2 font-semibold text-primary"
              >
                Sign up as an employer
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </InViewItem>
          </InView>
        </Section>
      </SignedOutOnly>
    </>
  );
}
