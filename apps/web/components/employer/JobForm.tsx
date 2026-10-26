"use client";

import {
  CURRENCIES,
  EMPLOYMENT_TYPES,
  JobInputSchema,
  LIMITS,
  PAY_FREQUENCIES,
  WORKPLACES,
  type EmployerJob,
  type JobInput,
  type PayType,
} from "@pitchperfect/shared";
import { X } from "lucide-react";
import { useState } from "react";
import { FieldGroup, FormAlert } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { Select } from "@/components/ui/Select";
import { EMPLOYER_API_MESSAGES } from "@/lib/employer-api";
import { EMPLOYMENT_TYPE_LABELS, PAY_FREQUENCY_LABELS, WORKPLACE_LABELS } from "@/lib/job-labels";
import { useZodForm, type FormValues } from "@/lib/use-form";
import { RichTextEditor } from "./RichTextEditor";

/** A job's content: everything the employer writes. Status changes go through their own route. */
export type JobContent = Omit<JobInput, "status">;
export type JobIntent = "save" | "publish";

const JobContentSchema = JobInputSchema.omit({ status: true });

const PAY_TYPES: readonly { value: PayType; label: string }[] = [
  { value: "range", label: "Range" },
  { value: "exact", label: "Exact amount" },
  { value: "unpaid", label: "Unpaid" },
];

const REQUIRED = {
  title: "Enter a job title",
  location: "Enter where the job is, or “Remote”",
  workplace: "Choose where the work happens",
  employmentType: "Choose the kind of job",
  descriptionHtml: "Add a job description",
  "pay.min": "Enter the lowest pay",
  "pay.max": "Enter the highest pay",
  "pay.amount": "Enter the pay",
};

const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * "52,000" or "$22.50" as a number. Anything that isn't a number reads as -1, so the schema's
 * "above 0" check answers it with "Enter a number above 0".
 */
function amount(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[\s,$€]/g, "");
  return /^\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : -1;
}

/** The flat form values as the schema's input: the pay object holds only its type's fields. */
function toJobInput(input: Record<string, unknown>): Record<string, unknown> {
  const pay = (input.pay ?? {}) as Record<string, unknown>;
  const terms = {
    currency: pay.currency,
    frequency: pay.frequency,
    commission: pay.commission === true,
  };
  const payInput =
    pay.type === "unpaid"
      ? { type: "unpaid" }
      : pay.type === "exact"
        ? { type: "exact", amount: amount(pay.amount), ...terms }
        : { type: "range", min: amount(pay.min), max: amount(pay.max), ...terms };
  const skills = typeof input.skills === "string" ? input.skills.split("\n").filter(Boolean) : [];
  return { ...input, pay: payInput, skills };
}

function initialValues(job?: EmployerJob): FormValues {
  const pay = job?.pay;
  const terms = pay && pay.type !== "unpaid" ? pay : undefined;
  return {
    title: job?.title ?? "",
    location: job?.location ?? "",
    workplace: job?.workplace ?? "",
    employmentType: job?.employmentType ?? "",
    descriptionHtml: job?.descriptionHtml ?? "",
    skills: job?.skills.join("\n") ?? "",
    "pay.type": pay?.type ?? "range",
    "pay.min": pay?.type === "range" ? String(pay.min) : "",
    "pay.max": pay?.type === "range" ? String(pay.max) : "",
    "pay.amount": pay?.type === "exact" ? String(pay.amount) : "",
    "pay.currency": terms?.currency ?? "USD",
    "pay.frequency": terms?.frequency ?? "annually",
    "pay.commission": terms?.commission ?? false,
  };
}

interface SkillsInputProps {
  skills: readonly string[];
  onChange: (skills: string[]) => void;
  error?: string | undefined;
}

/** Skills as removable chips: Enter or a comma adds one, repeats are skipped, 15 at most. */
function SkillsInput({ skills, onChange, error }: SkillsInputProps) {
  const [draft, setDraft] = useState("");
  const full = skills.length >= LIMITS.jobSkillsMax;

  function add() {
    const skill = draft.trim().replace(/,+$/, "").trim();
    setDraft("");
    if (!skill || full) return;
    if (skills.some((existing) => existing.toLowerCase() === skill.toLowerCase())) return;
    onChange([...skills, skill]);
  }

  const hint = full
    ? `${String(skills.length)} of ${String(LIMITS.jobSkillsMax)}. Remove one to add another.`
    : `${String(skills.length)} of ${String(LIMITS.jobSkillsMax)}. Press Enter after each one. Students see them on the listing.`;

  return (
    <Field label="Skills" hint={hint} error={error}>
      {skills.length > 0 && (
        <ul aria-label="Skills added" className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <li
              key={skill}
              className="inline-flex items-center gap-1 rounded-pill bg-primary-soft py-1 pr-1 pl-3 text-small font-semibold text-ink"
            >
              {skill}
              <button
                type="button"
                aria-label={`Remove ${skill}`}
                onClick={() => {
                  onChange(skills.filter((existing) => existing !== skill));
                }}
                // A 44 px tap target around the small icon, without making the chip taller.
                className="relative rounded-pill p-1 text-muted after:absolute after:-inset-[11px] hover:bg-white hover:text-ink"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          maxLength={LIMITS.jobSkillMaxLength}
          disabled={full}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="e.g. Cold outreach"
        />
        <Button variant="secondary" onClick={add} disabled={full} className="shrink-0">
          Add
        </Button>
      </div>
    </Field>
  );
}

interface JobFormProps {
  /** The saved job when editing; a new job starts empty. */
  initial?: EmployerJob;
  /** Saves the content; with "publish", also makes the job live. Throw an ApiError to show it. */
  onSubmit: (job: JobContent, intent: JobIntent) => Promise<void>;
}

/**
 * The job editor, for new jobs and edits alike. Pay is checked with the shared schema here
 * (a range's minimum can't be above its maximum) before anything is sent.
 */
export function JobForm({ initial, onSubmit }: JobFormProps) {
  const [intent, setIntent] = useState<JobIntent>("save");
  const publishable = !initial || initial.status === "draft";
  const { values, errors, formError, submitting, register, setValue, handleSubmit } = useZodForm(
    JobContentSchema,
    async (job, action) => {
      // The button's value; Enter in a field submits with the first button, "Save draft".
      const next: JobIntent = action === "publish" ? "publish" : "save";
      setIntent(next);
      await onSubmit(job, next);
    },
    {
      initial: initialValues(initial),
      required: REQUIRED,
      toInput: toJobInput,
      apiMessages: EMPLOYER_API_MESSAGES,
    },
  );
  const payType = values["pay.type"] as PayType;
  const skills = typeof values.skills === "string" ? values.skills.split("\n").filter(Boolean) : [];

  return (
    <form
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
      className="flex flex-col gap-10"
    >
      <FieldGroup legend="The role">
        <Field label="Job title" required error={errors.title}>
          <Input {...register("title")} maxLength={LIMITS.jobTitleMaxLength} />
        </Field>
        <Field
          label="Location"
          hint="A city, or “Remote, US” for a remote job."
          required
          error={errors.location}
        >
          <Input {...register("location")} maxLength={LIMITS.jobLocationMaxLength} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Workplace" required error={errors.workplace}>
            <Select {...register("workplace")}>
              <option value="">Choose one</option>
              {WORKPLACES.map((value) => (
                <option key={value} value={value}>
                  {WORKPLACE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Job type" required error={errors.employmentType}>
            <Select {...register("employmentType")}>
              <option value="">Choose one</option>
              {EMPLOYMENT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {EMPLOYMENT_TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </FieldGroup>

      <FieldGroup legend="Pay">
        <RadioGroup
          legend="How the pay is shown"
          hint="Every job on PitchPerfect shows its pay."
          name="pay.type"
          options={PAY_TYPES}
          value={payType}
          onChange={(value) => {
            setValue("pay.type", value);
          }}
        />
        {payType !== "unpaid" && (
          <>
            {payType === "range" ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Lowest" required error={errors["pay.min"]}>
                  <Input {...register("pay.min")} inputMode="decimal" />
                </Field>
                <Field label="Highest" required error={errors["pay.max"]}>
                  <Input {...register("pay.max")} inputMode="decimal" />
                </Field>
              </div>
            ) : (
              <Field label="Amount" required error={errors["pay.amount"]} className="sm:max-w-xs">
                <Input {...register("pay.amount")} inputMode="decimal" />
              </Field>
            )}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Currency" required error={errors["pay.currency"]}>
                <Select {...register("pay.currency")}>
                  {CURRENCIES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="How often" required error={errors["pay.frequency"]}>
                <Select {...register("pay.frequency")}>
                  {PAY_FREQUENCIES.map((value) => (
                    <option key={value} value={value}>
                      {sentenceCase(PAY_FREQUENCY_LABELS[value])}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Checkbox {...register("pay.commission")} label="Plus commission" />
          </>
        )}
      </FieldGroup>

      <FieldGroup legend="Description and skills">
        <RichTextEditor
          label="Job description"
          hint="What they’ll do in a normal week, who they’ll work with, and what you’re looking for."
          required
          error={errors.descriptionHtml}
          initialHtml={initial?.descriptionHtml}
          onChange={(html) => {
            setValue("descriptionHtml", html);
          }}
        />
        <SkillsInput
          skills={skills}
          error={errors.skills}
          onChange={(next) => {
            setValue("skills", next.join("\n"));
          }}
        />
      </FieldGroup>

      <div className="flex flex-col gap-5 border-t border-border pt-6">
        <FormAlert message={formError} />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
          {publishable ? (
            <>
              <Button
                type="submit"
                variant="secondary"
                size="lg"
                name="intent"
                value="save"
                loading={submitting && intent === "save"}
                disabled={submitting}
              >
                Save draft
              </Button>
              <Button
                type="submit"
                size="lg"
                name="intent"
                value="publish"
                loading={submitting && intent === "publish"}
                disabled={submitting}
              >
                Publish
              </Button>
            </>
          ) : (
            <Button type="submit" size="lg" loading={submitting}>
              Save changes
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
