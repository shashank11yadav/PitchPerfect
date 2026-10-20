import { AuthCard } from "@/components/auth/AuthCard";
import { VerifyEmailStatus } from "@/components/auth/VerifyEmailStatus";
import { AUTH_PAGES, tokenPageMetadata } from "@/lib/seo";
import { queryValue, type SearchParams } from "../search-params";

export const metadata = tokenPageMetadata(AUTH_PAGES.verifyEmail);

export default async function VerifyEmailPage({ searchParams }: { searchParams: SearchParams }) {
  const token = await queryValue(searchParams, "token");
  return (
    <AuthCard
      title="Confirm your email"
      lead="Confirming your address lets you practice, apply to jobs and post roles. For employers, it’s also how we check your company’s domain."
    >
      <VerifyEmailStatus token={token} />
    </AuthCard>
  );
}
