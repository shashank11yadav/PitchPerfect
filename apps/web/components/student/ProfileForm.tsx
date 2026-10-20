"use client";

import {
  EmployerProfileUpdateSchema,
  StudentProfileUpdateSchema,
  type AuthMe,
  type PublicUser,
  type Role,
} from "@pitchperfect/shared";
import { useState, type ReactNode } from "react";
import { SubmitRow } from "@/components/auth/form-parts";
import {
  GradYearOptions,
  STUDENT_FIELD_MESSAGES,
  StateOptions,
  withYear,
} from "@/components/auth/profile-options";
import { SettingsNews } from "@/components/settings/settings-form";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/LoadState";
import { Select } from "@/components/ui/Select";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useZodForm, type FormSchema, type FormValues, type RegisteredField } from "@/lib/use-form";

/** How a field is drawn: a text input, or a select with a fixed list of choices. */
type Kind = "text" | "gradYear" | "state";

interface ProfileField {
  name: string;
  label: string;
  /** Shown when the field is left empty. */
  missing: string;
  kind?: Kind;
  hint?: string;
  autoComplete?: string;
  /** Sits beside the next field on wider screens. */
  half?: boolean;
}

const NAME_FIELDS: readonly ProfileField[] = [
  {
    name: "firstName",
    label: "First name",
    missing: "Enter your first name",
    autoComplete: "given-name",
    half: true,
  },
  {
    name: "lastName",
    label: "Last name",
    missing: "Enter your last name",
    autoComplete: "family-name",
    half: true,
  },
];

/** Every role's editable profile, in order. Names live on the user; the rest on the profile. */
const FIELDS: Record<Role, readonly ProfileField[]> = {
  student: [
    ...NAME_FIELDS,
    {
      name: "school",
      label: "School",
      missing: STUDENT_FIELD_MESSAGES.school,
      autoComplete: "organization",
    },
    { name: "major", label: "Major", missing: STUDENT_FIELD_MESSAGES.major },
    {
      name: "gradYear",
      label: "Graduation year",
      missing: STUDENT_FIELD_MESSAGES.gradYear,
      kind: "gradYear",
      half: true,
    },
    {
      name: "state",
      label: "State",
      missing: STUDENT_FIELD_MESSAGES.state,
      kind: "state",
      autoComplete: "address-level1",
      half: true,
    },
    {
      name: "targetRole",
      label: "Role you’re aiming for",
      missing: STUDENT_FIELD_MESSAGES.targetRole,
      hint: "The practice partner uses it to set up your buyer.",
    },
    { name: "industry", label: "Industry", missing: STUDENT_FIELD_MESSAGES.industry },
  ],
  employer: [
    ...NAME_FIELDS,
    {
      name: "jobTitle",
      label: "Job title",
      missing: "Enter your job title",
      autoComplete: "organization-title",
    },
  ],
};

/** The update schemas with every field required: the form always sends the whole profile. */
const SCHEMAS: Record<Role, FormSchema<Record<string, unknown>>> = {
  student: StudentProfileUpdateSchema.required(),
  employer: EmployerProfileUpdateSchema.required(),
};

function control(field: ProfileField, binding: RegisteredField): ReactNode {
  if (field.kind === "gradYear") {
    return (
      <Select {...binding}>
        <GradYearOptions />
      </Select>
    );
  }
  if (field.kind === "state") {
    return (
      <Select {...binding} autoComplete={field.autoComplete}>
        <StateOptions />
      </Select>
    );
  }
  return <Input {...binding} autoComplete={field.autoComplete} />;
}

/** The form's starting values: the signed-in user's names and profile, as text. */
function initialValues(
  fields: readonly ProfileField[],
  user: PublicUser,
  profile: AuthMe["profile"],
) {
  const source: Record<string, unknown> = { ...profile, ...user };
  return Object.fromEntries(
    fields.map(({ name }) => {
      const value = source[name];
      return [name, typeof value === "string" || typeof value === "number" ? String(value) : ""];
    }),
  ) as FormValues;
}

interface FormProps {
  role: Role;
  initial: FormValues;
}

function ProfileFields({ role, initial }: FormProps) {
  const { refresh } = useSession();
  const [news, setNews] = useState("");
  const fields = FIELDS[role];
  const { register, errors, formError, submitting, handleSubmit } = useZodForm(
    SCHEMAS[role],
    async (body) => {
      await apiFetch("/me/profile", { method: "PATCH", body });
      await refresh();
      setNews("Profile saved.");
    },
    {
      initial,
      required: Object.fromEntries(fields.map(({ name, missing }) => [name, missing])),
      toInput: role === "student" ? withYear : undefined,
    },
  );

  return (
    <form
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
      onChange={() => {
        setNews("");
      }}
      className="flex flex-col gap-5"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map((field) => (
          <Field
            key={field.name}
            label={field.label}
            hint={field.hint}
            required
            error={errors[field.name]}
            className={field.half ? undefined : "sm:col-span-2"}
          >
            {control(field, register(field.name))}
          </Field>
        ))}
      </div>
      <SubmitRow label="Save profile" submitting={submitting} formError={formError} />
      <SettingsNews news={news} />
    </form>
  );
}

/**
 * The one profile form, for either role, drawn from that role's field list. It starts from the
 * session and saves the whole profile with `PATCH /api/me/profile`.
 */
export function ProfileForm({ role }: { role: Role }) {
  const { user, profile } = useSession();
  if (!user || !profile) return <Loading label="Loading your profile" />;
  return (
    <ProfileFields key={user.id} role={role} initial={initialValues(FIELDS[role], user, profile)} />
  );
}
