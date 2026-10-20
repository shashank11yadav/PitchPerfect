import { LIMITS } from "@pitchperfect/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { ChangeEmailForm } from "@/components/settings/ChangeEmailForm";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { SettingsNav, SettingsSection } from "@/components/settings/SettingsSection";
import { AccountDanger } from "@/components/student/AccountDanger";
import { ProfileForm } from "@/components/student/ProfileForm";
import { ResumeUpload } from "@/components/student/ResumeUpload";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  { id: "profile", title: "Profile" },
  { id: "resume", title: "Résumé" },
  { id: "email", title: "Email" },
  { id: "password", title: "Password" },
  { id: "privacy", title: "Privacy" },
  { id: "delete", title: "Delete account" },
] as const;

const TEXT_LINK = "pp-link rounded-control font-semibold text-primary";

export default function StudentSettingsPage() {
  return (
    <div className="grid gap-8 lg:grid-cols-[11rem_minmax(0,1fr)] xl:gap-12">
      <SettingsNav sections={SECTIONS} />
      <div className="flex max-w-3xl flex-col gap-6">
        <SettingsSection
          id="profile"
          title="Profile"
          description="Employers see your name, school, major and graduation year when you apply."
        >
          <ProfileForm role="student" />
        </SettingsSection>
        <SettingsSection id="resume" title="Résumé">
          <ResumeUpload />
        </SettingsSection>
        <SettingsSection id="email" title="Email">
          <ChangeEmailForm />
        </SettingsSection>
        <SettingsSection
          id="password"
          title="Password"
          description="Changing it signs you out everywhere else."
        >
          <ChangePasswordForm />
        </SettingsSection>
        <SettingsSection id="privacy" title="Privacy">
          <div className="flex max-w-prose flex-col gap-4 text-ink">
            <p>
              Practice transcripts and scorecards are deleted {LIMITS.attemptRetentionDays} days
              after the call. Employers only see a scorecard you choose to attach to an application,
              and never your email address.
            </p>
            <p className="flex flex-wrap gap-x-6 gap-y-2">
              <Link href="/privacy" className={TEXT_LINK}>
                Privacy policy
              </Link>
              <Link href="/terms" className={TEXT_LINK}>
                Terms of use
              </Link>
            </p>
          </div>
        </SettingsSection>
        <SettingsSection id="delete" title="Delete account" danger>
          <AccountDanger />
        </SettingsSection>
      </div>
    </div>
  );
}
