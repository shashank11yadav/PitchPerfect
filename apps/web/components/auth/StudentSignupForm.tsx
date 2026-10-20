"use client";

import { US_STATES, gradYearRange } from "@pitchperfect/shared";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { AccountFields, FieldGroup } from "./form-parts";
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
  ageConfirmed: "Confirm that you're 18 or older. PitchPerfect is for adults only.",
  school: "Enter your school",
  major: "Enter your major, or “Undecided”",
  gradYear: "Choose your graduation year",
  targetRole: "Enter the kind of role you want",
  industry: "Enter an industry, even a broad one",
  state: "Choose the state you live in",
};

/** The select gives text; the schema wants a number. */
const withYear = (input: Record<string, unknown>) => ({
  ...input,
  gradYear: typeof input.gradYear === "string" ? Number(input.gradYear) : input.gradYear,
});

function yearOptions(): number[] {
  const { min, max } = gradYearRange();
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

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
              <option value="">Choose a year</option>
              {yearOptions().map((year) => (
                <option key={year} value={String(year)}>
                  {year}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="State" required error={errors.state}>
            <Select {...register("state")} autoComplete="address-level1">
              <option value="">Choose a state</option>
              {US_STATES.map(({ code, name }) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </FieldGroup>

      <FieldGroup legend="The job you want">
        <Field
          label="Role you're aiming for"
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
        label="I'm 18 or older"
        error={errors.ageConfirmed}
      />
    </SignupFormShell>
  );
}
