"use client";

import { Checkbox } from "@/components/ui/Checkbox";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { AccountFields, FieldGroup } from "./form-parts";
import { GradYearOptions, STUDENT_FIELD_MESSAGES, StateOptions, withYear } from "./profile-options";
import { SignupFormShell, useSignupForm } from "./SignupFormShell";

const INITIAL = {
  role: "student",
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  school: "",
  major: "",
  gradYear: "",
  state: "",
  targetRole: "",
  industry: "",
  ageConfirmed: false,
};

const REQUIRED = {
  ageConfirmed: "Confirm that you’re 18 or older. PitchPerfect is for adults only.",
  ...STUDENT_FIELD_MESSAGES,
};

export function StudentSignupForm() {
  const signup = useSignupForm({ initial: INITIAL, required: REQUIRED, toInput: withYear });
  const { form } = signup;
  const { register, errors } = form;

  return (
    <SignupFormShell {...signup}>
      <FieldGroup legend="You">
        <AccountFields form={form} emailLabel="Email" />
      </FieldGroup>

      <FieldGroup legend="Where you study">
        <Field label="School" required error={errors.school}>
          <Input {...register("school")} autoComplete="organization" />
        </Field>
        <Field label="Major" required error={errors.major}>
          <Input {...register("major")} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Graduation year" required error={errors.gradYear}>
            <Select {...register("gradYear")}>
              <GradYearOptions />
            </Select>
          </Field>
          <Field label="State" required error={errors.state}>
            <Select {...register("state")} autoComplete="address-level1">
              <StateOptions />
            </Select>
          </Field>
        </div>
      </FieldGroup>

      <FieldGroup legend="The job you want">
        <Field
          label="Role you’re aiming for"
          hint="For example, sales development representative"
          required
          error={errors.targetRole}
        >
          <Input {...register("targetRole")} />
        </Field>
        <Field
          label="Industry"
          hint="For example, software or medical devices"
          required
          error={errors.industry}
        >
          <Input {...register("industry")} />
        </Field>
      </FieldGroup>

      <Checkbox
        {...register("ageConfirmed")}
        required
        label="I’m 18 or older"
        error={errors.ageConfirmed}
      />
    </SignupFormShell>
  );
}
