"use client";

import { ChangePasswordSchema } from "@pitchperfect/shared";
import { PasswordField } from "@/components/auth/PasswordField";
import { SubmitRow } from "@/components/auth/form-parts";
import { apiFetch } from "@/lib/api";
import { useZodForm } from "@/lib/use-form";
import { SettingsNews, useCredentialChange } from "./settings-form";

const WRONG_PASSWORD = "Your current password isn’t right.";

function PasswordForm({ onChanged }: { onChanged: () => Promise<void> }) {
  const { register, errors, formError, submitting, handleSubmit } = useZodForm(
    ChangePasswordSchema,
    async (body) => {
      await apiFetch("/me/change-password", { method: "POST", body });
      await onChanged();
    },
    {
      initial: { currentPassword: "", newPassword: "" },
      required: {
        currentPassword: "Enter your current password",
        newPassword: "Choose a new password",
      },
      apiMessages: { invalid_credentials: WRONG_PASSWORD },
    },
  );

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-5">
      <PasswordField
        {...register("currentPassword")}
        label="Current password"
        autoComplete="current-password"
        error={errors.currentPassword}
      />
      <PasswordField
        {...register("newPassword")}
        label="New password"
        autoComplete="new-password"
        strengthHint
        error={errors.newPassword}
      />
      <SubmitRow label="Change password" submitting={submitting} formError={formError} />
    </form>
  );
}

/** Change the password, keeping this browser signed in. Shared by student and employer settings. */
export function ChangePasswordForm() {
  const { round, news, changed, clearNews } = useCredentialChange();
  return (
    <div className="flex flex-col gap-4" onFocus={clearNews}>
      <PasswordForm
        key={round}
        onChanged={() =>
          changed(
            "Your password is changed. You’re still signed in here, and every other device was signed out.",
          )
        }
      />
      <SettingsNews news={news} />
    </div>
  );
}
