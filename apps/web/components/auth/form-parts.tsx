"use client";

import { CircleAlert } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import type { FieldErrors, RegisteredField } from "@/lib/use-form";
import { PasswordField } from "./PasswordField";

/** The parts of `useZodForm` the shared field groups need. */
interface FormBinding {
  register: (name: string) => RegisteredField;
  errors: FieldErrors;
}

/** One message for the whole form, read out when it appears. */
function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-control bg-surface-2 px-4 py-3 text-body text-danger"
    >
      <CircleAlert aria-hidden="true" className="mt-1 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

interface SubmitRowProps {
  label: string;
  submitting: boolean;
  formError: string | null;
  /** A text link beside the button, e.g. the way to the other form. */
  children?: ReactNode;
}

/** The form-level message, then the one primary button. */
export function SubmitRow({ label, submitting, formError, children }: SubmitRowProps) {
  return (
    <div className="flex flex-col gap-5">
      <FormAlert message={formError} />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <Button type="submit" size="lg" loading={submitting} className="w-full sm:w-auto">
          {label}
        </Button>
        {children}
      </div>
    </div>
  );
}

/** A group of fields with a visible legend. */
export function FieldGroup({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-5">
      <legend className="mb-5 font-display text-h4 font-semibold text-navy">{legend}</legend>
      {children}
    </fieldset>
  );
}

interface AccountFieldsProps {
  form: FormBinding;
  emailLabel: string;
  emailHint?: string;
  /** Fields that sit between the email and the password (an employer's job title). */
  children?: ReactNode;
}

/** Name, email and a new password: the same for both kinds of account. */
export function AccountFields({ form, emailLabel, emailHint, children }: AccountFieldsProps) {
  const { register, errors } = form;
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First name" required error={errors.firstName}>
          <Input {...register("firstName")} autoComplete="given-name" />
        </Field>
        <Field label="Last name" required error={errors.lastName}>
          <Input {...register("lastName")} autoComplete="family-name" />
        </Field>
      </div>
      <Field label={emailLabel} hint={emailHint} required error={errors.email}>
        <Input {...register("email")} type="email" autoComplete="email" spellCheck={false} />
      </Field>
      {children}
      <PasswordField
        {...register("password")}
        autoComplete="new-password"
        strengthHint
        error={errors.password}
      />
    </>
  );
}

interface DoneMessageProps {
  title: string;
  children: ReactNode;
}

/**
 * What replaces a form once it has done its job. Focus moves to its heading so screen reader
 * and keyboard users land on the news instead of on a button that no longer exists.
 */
export function DoneMessage({ title, children }: DoneMessageProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <div className="flex flex-col gap-5">
      <h2 ref={heading} tabIndex={-1} className="text-section outline-none">
        {title}
      </h2>
      {children}
    </div>
  );
}

/** The heading for an emailed link that no longer works, on the verify and reset pages. */
export const DEAD_LINK_TITLE = "This link has expired or was already used";

/**
 * Takes an emailed token out of the address bar once the page has it, so it isn't left in
 * history, bookmarks or anything that reads the URL later. Next's router state is kept.
 */
export function useForgetLinkToken() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("token")) return;
    url.searchParams.delete("token");
    const rest = url.searchParams.size > 0 ? `?${url.searchParams.toString()}` : "";
    window.history.replaceState(window.history.state, "", `${url.pathname}${rest}${url.hash}`);
  }, []);
}
