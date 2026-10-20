import { AuthCard } from "@/components/auth/AuthCard";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { AUTH_PAGES, authPageMetadata } from "@/lib/seo";

export const metadata = authPageMetadata(AUTH_PAGES.forgotPassword);

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot your password?"
      lead="Enter the email you signed up with. We’ll send a link to choose a new password."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
