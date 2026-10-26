"use client";

import { ForgotPasswordSchema, LIMITS } from "@pitchperfect/shared";
import Link from "next/link";
import { useState } from "react";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { apiFetch } from "@/lib/api";
import { useZodForm } from "@/lib/use-form";
import { AUTH_LINK } from "./AuthCard";
import { DoneMessage, SubmitRow } from "./form-parts";

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { register, errors, formError, submitting, handleSubmit } = useZodForm(
    ForgotPasswordSchema,
    async ({ email }) => {
      await apiFetch("/auth/forgot-password", { method: "POST", body: { email } });
      setSentTo(email);
    },
    { initial: { email: "" }, required: { email: "Enter your email address" } },
  );

  // The api answers the same for every address, so this can't say whether an account exists.
  if (sentTo) {
    return (
      <DoneMessage title="Check your inbox">
        <p className="text-lede text-ink">
          If there’s an account for <strong className="font-semibold break-all">{sentTo}</strong>,
          we’ve sent it a link to choose a new password. The link works for{" "}
          {LIMITS.resetTokenMinutes} minutes.
        </p>
        <p>
          <Link href="/signin" className={AUTH_LINK}>
            Back to sign in
          </Link>
        </p>
      </DoneMessage>
    );
  }

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-6">
      <Field label="Email" required error={errors.email}>
        <Input {...register("email")} type="email" autoComplete="email" spellCheck={false} />
      </Field>
      <SubmitRow label="Send reset link" submitting={submitting} formError={formError}>
        <Link href="/signin" className={AUTH_LINK}>
          Back to sign in
        </Link>
      </SubmitRow>
    </form>
  );
}
