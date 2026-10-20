import Link from "next/link";
import { AUTH_LINK, AuthCard } from "@/components/auth/AuthCard";
import { SigninForm } from "@/components/auth/SigninForm";
import { AUTH_PAGES, authPageMetadata } from "@/lib/seo";
import { queryValue, type SearchParams } from "../search-params";

export const metadata = authPageMetadata(AUTH_PAGES.signin);

export default async function SigninPage({ searchParams }: { searchParams: SearchParams }) {
  const next = await queryValue(searchParams, "next");
  return (
    <AuthCard
      title="Sign in"
      lead="Pick up your practice where you left off, or check on the people who applied to your jobs."
      aside={
        <>
          No account yet?{" "}
          <Link href="/signup" className={AUTH_LINK}>
            Create one
          </Link>
        </>
      }
    >
      <SigninForm next={next} />
    </AuthCard>
  );
}
