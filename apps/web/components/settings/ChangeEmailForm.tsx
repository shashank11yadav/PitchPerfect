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

const ADDRESS = "font-semibold [overflow-wrap:anywhere]";

/**
 * Move the account to a new address. Nothing changes until the link sent to the new address is
 * followed; until then the pending address is shown under the current one. Shared by student and
 * employer settings.
 */
export function ChangeEmailForm() {
  const { user } = useSession();
  const { round, news, changed, clearNews } = useCredentialChange();
  return (
    <div className="flex flex-col gap-4" onFocus={clearNews}>
      {user && (
        <p className="text-ink">
          You sign in with <span className={ADDRESS}>{user.email}</span>.
        </p>
      )}
      {user?.pendingEmail && (
        <p className="text-ink">
          Waiting to move to <span className={ADDRESS}>{user.pendingEmail}</span>. If that address
          can be used, the link we sent there makes the change. Until it’s followed, your email
          stays the same.
        </p>
      )}
      <EmailForm
        key={round}
        onChanged={(email) =>
          changed(
            `If ${email} can be used, we sent it a link. Your email changes once that link is followed, and stays the same until then.`,
          )
        }
      />
      <SettingsNews news={news} />
    </div>
  );
}
