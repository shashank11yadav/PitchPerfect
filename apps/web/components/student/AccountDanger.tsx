"use client";

import { DeleteAccountSchema } from "@pitchperfect/shared";
import { PasswordField } from "@/components/auth/PasswordField";
import { FormAlert } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useZodForm } from "@/lib/use-form";

const CONFIRM_WORD = "DELETE";

/** The typed confirmation is for the button only; the api takes just the password. */
const passwordOnly = (input: Record<string, unknown>) => ({
  currentPassword: input.currentPassword,
});

/**
 * Deletes the student's account for good. The button stays disabled until they type DELETE and
 * their current password; afterwards the session is gone, so this signs out and goes home.
 */
export function AccountDanger() {
  const { signOut } = useSession();
  const { values, register, errors, formError, submitting, handleSubmit } = useZodForm(
    DeleteAccountSchema,
    async (body) => {
      await apiFetch("/me", { method: "DELETE", body });
      // The api already ended the session; this forgets it here and goes to the home page.
      await signOut();
    },
    {
      initial: { confirm: "", currentPassword: "" },
      toInput: passwordOnly,
      apiMessages: {
        invalid_credentials: "That password isn’t right, so nothing was deleted.",
      },
    },
  );
  const ready = values.confirm === CONFIRM_WORD && values.currentPassword !== "";

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-5">
      <p className="max-w-[62ch] text-ink">
        This permanently deletes your profile, résumé, practice scorecards, saved jobs and
        applications. Employers you applied to will no longer see your applications. There&apos;s no
        undo.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={`Type ${CONFIRM_WORD} to confirm`}>
          <Input
            {...register("confirm")}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="characters"
          />
        </Field>
        <PasswordField
          {...register("currentPassword")}
          label="Current password"
          autoComplete="current-password"
          error={errors.currentPassword}
        />
      </div>
      <FormAlert message={formError} />
      <div>
        <Button type="submit" variant="danger" disabled={!ready} loading={submitting}>
          Delete my account
        </Button>
      </div>
    </form>
  );
}
