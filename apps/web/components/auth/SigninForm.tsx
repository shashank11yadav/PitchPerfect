"use client";

import { SigninSchema, type PublicUser } from "@pitchperfect/shared";
import Link from "next/link";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { ApiError, apiFetch, resetCsrf } from "@/lib/api";
import { SignedOutOnly, useSession } from "@/lib/session";
import { useZodForm } from "@/lib/use-form";
import { AUTH_LINK } from "./AuthCard";
import { SubmitRow } from "./form-parts";
import { PasswordField } from "./PasswordField";

/** Never says which of the two was wrong, the same way the api doesn't. */
const NO_MATCH = "That email and password don't match an account. Check both and try again.";

interface SigninFormProps {
  /** The `next` query parameter; `SignedOutOnly` only follows it if `safeNext` allows it. */
  next?: string | undefined;
}

export function SigninForm({ next }: SigninFormProps) {
  return (
    <SignedOutOnly next={next}>
      <Form />
    </SignedOutOnly>
  );
}

function Form() {
  const { refresh } = useSession();
  const { register, errors, formError, submitting, handleSubmit } = useZodForm(
    SigninSchema,
    async (credentials) => {
      await apiFetch<{ user: PublicUser }>("/auth/signin", { method: "POST", body: credentials });
      // Signing in rotates the session ID, and the CSRF token was bound to the old one.
      resetCsrf();
      // Once the session says who this is, SignedOutOnly moves on to `next` or the role's home.
      if ((await refresh()) === "unavailable") {
        throw new ApiError(
          503,
          "session_unavailable",
          "You're signed in, but we couldn't load your account. Try again in a moment.",
        );
      }
    },
    {
      initial: { email: "", password: "" },
      required: { email: "Enter your email address", password: "Enter your password" },
      apiMessages: { invalid_credentials: NO_MATCH },
    },
  );

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-6">
      <Field label="Email" required error={errors.email}>
        <Input {...register("email")} type="email" autoComplete="email" spellCheck={false} />
      </Field>
      <div className="flex flex-col gap-2">
        <PasswordField
          {...register("password")}
          autoComplete="current-password"
          error={errors.password}
        />
        <Link href="/forgot-password" className={`${AUTH_LINK} self-start text-small`}>
          Forgot password?
        </Link>
      </div>
      <SubmitRow label="Sign in" submitting={submitting} formError={formError} />
    </form>
  );
}
