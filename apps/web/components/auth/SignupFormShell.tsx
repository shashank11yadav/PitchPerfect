"use client";

import { SignupSchema } from "@pitchperfect/shared";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useZodForm, type FormValues } from "@/lib/use-form";
import { AUTH_LINK } from "./AuthCard";
import { CheckInbox } from "./CheckInbox";
import { SubmitRow } from "./form-parts";

interface SignupOptions {
  initial: FormValues;
  required: Record<string, string>;
  toInput?: (input: Record<string, unknown>) => Record<string, unknown>;
}

/** Messages for fields both forms share; each form adds its own. */
const ACCOUNT_REQUIRED = {
  firstName: "Enter your first name",
  lastName: "Enter your last name",
  email: "Enter your email address",
  password: "Choose a password",
};

/** Both sign-up forms: the shared schema, `POST /auth/signup`, then the inbox message. */
export function useSignupForm(options: SignupOptions) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useZodForm(
    SignupSchema,
    async (signup) => {
      await apiFetch("/auth/signup", { method: "POST", body: signup });
      setSentTo(signup.email);
    },
    { ...options, required: { ...ACCOUNT_REQUIRED, ...options.required } },
  );
  return { form, sentTo };
}

interface SignupFormShellProps extends ReturnType<typeof useSignupForm> {
  children: ReactNode;
}

/** The form element and its submit row, or the inbox message once it has been sent. */
export function SignupFormShell({ form, sentTo, children }: SignupFormShellProps) {
  if (sentTo) return <CheckInbox email={sentTo} />;
  return (
    <form
      noValidate
      onSubmit={(event) => void form.handleSubmit(event)}
      className="flex flex-col gap-10"
    >
      {children}
      <p className="text-small text-ink">
        Creating an account means you agree to the{" "}
        <Link href="/terms" className={AUTH_LINK}>
          terms of use
        </Link>{" "}
        and have read the{" "}
        <Link href="/privacy" className={AUTH_LINK}>
          privacy policy
        </Link>
        .
      </p>
      <SubmitRow label="Create account" submitting={form.submitting} formError={form.formError} />
    </form>
  );
}
