import Link from "next/link";
import { AUTH_LINK, AuthCard } from "@/components/auth/AuthCard";
import { StudentSignupForm } from "@/components/auth/StudentSignupForm";
import { SignedOutOnly } from "@/lib/session";
import { AUTH_PAGES, authPageMetadata } from "@/lib/seo";

export const metadata = authPageMetadata(AUTH_PAGES.signupStudent);

export default function StudentSignupPage() {
  return (
    <AuthCard
      size="wide"
      title="Your student account"
      lead="It’s free. Practice sales calls with the practice partner, keep your scorecards, and apply to entry-level jobs from the same account."
      aside={
        <>
          Hiring instead?{" "}
          <Link href="/signup/employer" className={AUTH_LINK}>
            Create an employer account
          </Link>
        </>
      }
    >
      <SignedOutOnly>
        <StudentSignupForm />
      </SignedOutOnly>
    </AuthCard>
  );
}
