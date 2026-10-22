import { AuthCard } from "@/components/auth/AuthCard";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { AUTH_PAGES, tokenPageMetadata } from "@/lib/seo";
import { queryValue, type SearchParams } from "@/lib/search-params";

export const metadata = tokenPageMetadata(AUTH_PAGES.resetPassword);

export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const token = await queryValue(searchParams, "token");
  return (
    <AuthCard
      title="Choose a new password"
      lead="Pick one you don’t use anywhere else. The link you followed works once, so finish here."
    >
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
