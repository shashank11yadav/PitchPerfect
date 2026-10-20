import type { Metadata } from "next";
import { ChangeEmailForm } from "@/components/settings/ChangeEmailForm";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { SettingsNav, SettingsSection } from "@/components/settings/SettingsSection";
import { AccountDanger } from "@/components/student/AccountDanger";
import { ProfileForm } from "@/components/student/ProfileForm";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  { id: "profile", title: "Profile" },
  { id: "email", title: "Email" },
  { id: "password", title: "Password" },
  { id: "delete", title: "Delete account" },
] as const;

export default function EmployerSettingsPage() {
  return (
    <div className="grid gap-8 lg:grid-cols-[11rem_minmax(0,1fr)] xl:gap-12">
      <SettingsNav sections={SECTIONS} />
      <div className="flex max-w-3xl flex-col gap-6">
        <SettingsSection
          id="profile"
          title="Profile"
          description="Your name and job title. Company details are on the Company page."
        >
          <ProfileForm role="employer" />
        </SettingsSection>
        <SettingsSection
          id="email"
          title="Email"
          description="Your company goes back to unverified until the new address is confirmed and checked against your website."
        >
          <ChangeEmailForm />
        </SettingsSection>
        <SettingsSection
          id="password"
          title="Password"
          description="Changing it signs you out everywhere else."
        >
          <ChangePasswordForm />
        </SettingsSection>
        <SettingsSection id="delete" title="Delete account" danger>
          <AccountDanger role="employer" />
        </SettingsSection>
      </div>
    </div>
  );
}
