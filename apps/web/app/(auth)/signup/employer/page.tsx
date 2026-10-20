import Link from "next/link";
import { AUTH_LINK, AuthCard } from "@/components/auth/AuthCard";
import { EmployerSignupForm } from "@/components/auth/EmployerSignupForm";
import { SignedOutOnly } from "@/lib/session";
import { AUTH_PAGES, authPageMetadata } from "@/lib/seo";

export const metadata = authPageMetadata(AUTH_PAGES.signupEmployer);

export default function EmployerSignupPage() {
  return (
    <AuthCard
      size="wide"
      title="Your employer account"
      lead="Post entry-level sales roles and read applicants’ practice scorecards before you book an interview."
      aside={
        <>
          Looking for a job?{" "}
          <Link href="/signup/student" className={AUTH_LINK}>
            Create a student account
          </Link>
        </>
      }
    >
      <SignedOutOnly>
        <EmployerSignupForm />
      </SignedOutOnly>
    </AuthCard>
  );
}
