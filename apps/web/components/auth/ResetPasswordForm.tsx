"use client";

import { LIMITS, ResetPasswordSchema } from "@pitchperfect/shared";
import Link from "next/link";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useZodForm } from "@/lib/use-form";
import { AUTH_LINK } from "./AuthCard";
import {
  DEAD_LINK_TITLE,
  DoneMessage,
  isDeadLinkError,
  SubmitRow,
  useForgetLinkToken,
} from "./form-parts";
import { PasswordField } from "./PasswordField";

/** The client checks the password only; the token goes along as it came. */
const PasswordOnly = ResetPasswordSchema.pick({ password: true });

type Phase = "form" | "done" | "invalid";

interface ResetPasswordFormProps {
  /** From the emailed link's query string. */
  token: string | undefined;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  useForgetLinkToken();
  const [phase, setPhase] = useState<Phase>(token ? "form" : "invalid");
  const { register, errors, formError, submitting, handleSubmit } = useZodForm(
    PasswordOnly,
    async ({ password }) => {
      try {
        await apiFetch("/auth/reset-password", { method: "POST", body: { token, password } });
      } catch (error) {
        if (isDeadLinkError(error)) {
          setPhase("invalid");
          return;
        }
        throw error;
      }
      setPhase("done");
    },
    { initial: { password: "" }, required: { password: "Enter a new password" } },
  );

  if (phase === "invalid") {
    return (
      <DoneMessage title={DEAD_LINK_TITLE}>
        <p className="text-lede text-ink">
          Reset links work once, for {LIMITS.resetTokenMinutes} minutes. Ask for a new one and use
          the newest email.
        </p>
        <p>
          <Link href="/forgot-password" className={AUTH_LINK}>
            Ask for a new link
          </Link>
        </p>
      </DoneMessage>
    );
  }

  if (phase === "done") {
    return (
      <DoneMessage title="Your password is changed">
        <p className="text-lede text-ink">
          Anywhere you were still signed in has been signed out. Sign in again with the new
          password.
        </p>
        <p>
          <Link href="/signin" className={AUTH_LINK}>
            Sign in
          </Link>
        </p>
      </DoneMessage>
    );
  }

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-6">
      <PasswordField
        {...register("password")}
        label="New password"
        autoComplete="new-password"
        strengthHint
        error={errors.password}
      />
      <SubmitRow label="Save new password" submitting={submitting} formError={formError} />
    </form>
  );
}
