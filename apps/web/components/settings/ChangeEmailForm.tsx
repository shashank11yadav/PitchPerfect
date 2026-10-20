"use client";

import { ChangeEmailSchema } from "@pitchperfect/shared";
import { PasswordField } from "@/components/auth/PasswordField";
import { SubmitRow } from "@/components/auth/form-parts";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useZodForm } from "@/lib/use-form";
import { SettingsNews, useCredentialChange } from "./settings-form";

function EmailForm({ onChanged }: { onChanged: (email: string) => Promise<void> }) {
  const { register, errors, formError, submitting, handleSubmit } = useZodForm(
    ChangeEmailSchema,
    async (body) => {
      await apiFetch("/me/change-email", { method: "POST", body });
      await onChanged(body.newEmail);
    },
    {
      initial: { newEmail: "", currentPassword: "" },
      required: {
        newEmail: "Enter the new email address",
        currentPassword: "Enter your current password",
      },
      apiMessages: {
        email_taken: "That email already belongs to another account.",
        invalid_credentials: "Your current password isn’t right.",
      },
    },
  );

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-5">
      <Field label="New email" required error={errors.newEmail}>
        <Input {...register("newEmail")} type="email" autoComplete="email" spellCheck={false} />
      </Field>
      <PasswordField
        {...register("currentPassword")}
        label="Current password"
        autoComplete="current-password"
        error={errors.currentPassword}
      />
      <SubmitRow label="Change email" submitting={submitting} formError={formError} />
    </form>
  );
}

/**
 * Move the account to a new address. The new one has to be confirmed again, so the unconfirmed
 * banner comes back until it is. Shared by student and employer settings.
 */
export function ChangeEmailForm() {
  const { user } = useSession();
  const { round, news, changed, clearNews } = useCredentialChange();
  return (
    <div className="flex flex-col gap-4" onFocus={clearNews}>
      {user && (
        <p className="text-ink">
          You sign in with{" "}
          <span className="font-semibold [overflow-wrap:anywhere]">{user.email}</span>.
        </p>
      )}
      <EmailForm
        key={round}
        onChanged={(email) =>
          changed(
            `We sent a link to ${email}. Click it to confirm the new address. Your old address got a note about the change.`,
          )
        }
      />
      <SettingsNews news={news} />
    </div>
  );
}
