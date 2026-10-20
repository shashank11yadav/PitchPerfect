"use client";

import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { AccountFields, FieldGroup } from "./form-parts";
import { SignupFormShell, useSignupForm } from "./SignupFormShell";

const INITIAL = {
  role: "employer",
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  jobTitle: "",
  "company.name": "",
  "company.website": "",
  "company.linkedinUrl": "",
};

const REQUIRED = {
  email: "Enter your work email address",
  jobTitle: "Enter your job title",
  "company.name": "Enter your company's name",
  "company.website": "Enter your company's website",
};

export function EmployerSignupForm() {
  const signup = useSignupForm({ initial: INITIAL, required: REQUIRED });
  const { form } = signup;
  const { register, errors } = form;

  return (
    <SignupFormShell {...signup}>
      <FieldGroup legend="You">
        <AccountFields
          form={form}
          emailLabel="Work email"
          emailHint="Use your address at the company. When its domain matches the website below, confirming it verifies your company."
        >
          <Field label="Job title" required error={errors.jobTitle}>
            <Input {...register("jobTitle")} autoComplete="organization-title" />
          </Field>
        </AccountFields>
      </FieldGroup>

      <FieldGroup legend="Your company">
        <Field label="Company name" required error={errors["company.name"]}>
          <Input {...register("company.name")} autoComplete="organization" />
        </Field>
        <Field
          label="Company website"
          hint="The full address, starting with https://"
          required
          error={errors["company.website"]}
        >
          <Input
            {...register("company.website")}
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="https://"
            spellCheck={false}
          />
        </Field>
        <Field label="LinkedIn page" hint="Optional" error={errors["company.linkedinUrl"]}>
          <Input
            {...register("company.linkedinUrl")}
            type="url"
            inputMode="url"
            placeholder="https://www.linkedin.com/company/…"
            spellCheck={false}
          />
        </Field>
      </FieldGroup>
    </SignupFormShell>
  );
}
