"use client";

import { CompanyUpdateSchema, LIMITS, type PublicCompany } from "@pitchperfect/shared";
import { useState } from "react";
import { SubmitRow } from "@/components/auth/form-parts";
import { CompanyBadge } from "@/components/jobs/CompanyBadge";
import { SettingsNews } from "@/components/settings/settings-form";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { LoadError, Loading } from "@/components/ui/LoadState";
import { Textarea } from "@/components/ui/Textarea";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";
import { EMPLOYER_API_MESSAGES, OneCompany } from "@/lib/employer-api";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/use-api";
import { useZodForm } from "@/lib/use-form";
import { VerificationBanner } from "./VerificationBanner";

/** Name and website can't be blanked; the rest are optional. */
const CompanySchema = CompanyUpdateSchema.required({ name: true, website: true });

/** The form always sends every field; an emptied optional link is cleared with null. */
const toCompanyInput = (input: Record<string, unknown>) => ({
  name: input.name,
  website: input.website,
  linkedinUrl: input.linkedinUrl ?? null,
  pitch: input.pitch ?? "",
  logoUrl: input.logoUrl ?? null,
});

/** The badge vouches for a name on a domain, so the api drops it when either changes. */
const BADGE_LOSS = "removes the Verified badge until an admin approves the company again.";

/** What a save says, naming the change when it cost a verified company its badge. */
function savedNews(before: PublicCompany, saved: PublicCompany): string {
  if (before.verification !== "verified" || saved.verification !== "unverified") {
    return "Company saved.";
  }
  const change =
    saved.name === before.name
      ? "Moving the website to another domain"
      : "Changing the company name";
  return `Company saved. ${change} removed the Verified badge until an admin approves the company again.`;
}

/** "PD" for "Pitchwell Demo Hiring Co": the mark shown where a logo would go. */
function companyInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

/** The company's initials on navy, where a logo would go. Remote logos aren't loaded (CSP). */
export function CompanyMark({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center bg-navy font-display font-semibold text-white",
        size === "md" ? "size-14 rounded-card text-h4" : "size-10 rounded-control text-small",
      )}
    >
      {companyInitials(name)}
    </span>
  );
}

function CompanyFields({
  company,
  onSaved,
}: {
  company: PublicCompany;
  onSaved: (company: PublicCompany) => void;
}) {
  const { refresh } = useSession();
  const [news, setNews] = useState("");
  const { values, register, errors, formError, submitting, handleSubmit } = useZodForm(
    CompanySchema,
    async (body) => {
      const saved = await apiFetch("/employer/company", {
        method: "PATCH",
        body,
        schema: OneCompany,
      });
      onSaved(saved);
      await refresh();
      setNews(savedNews(company, saved));
    },
    {
      initial: {
        name: company.name,
        website: company.website,
        linkedinUrl: company.linkedinUrl ?? "",
        pitch: company.pitch,
        logoUrl: company.logoUrl ?? "",
      },
      required: { name: "Enter the company name", website: "Enter the company website" },
      toInput: toCompanyInput,
      apiMessages: EMPLOYER_API_MESSAGES,
    },
  );
  const pitchLength = typeof values.pitch === "string" ? values.pitch.length : 0;
  const verified = company.verification === "verified";

  return (
    <form
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
      onChange={() => {
        setNews("");
      }}
      className="flex flex-col gap-5"
    >
      <Field
        label="Company name"
        hint={verified ? `Changing it ${BADGE_LOSS}` : undefined}
        required
        error={errors.name}
      >
        <Input
          {...register("name")}
          autoComplete="organization"
          maxLength={LIMITS.profileTextMaxLength}
        />
      </Field>
      <Field
        label="Website"
        hint={verified ? `Moving it to another domain ${BADGE_LOSS}` : undefined}
        required
        error={errors.website}
      >
        <Input {...register("website")} type="url" inputMode="url" spellCheck={false} />
      </Field>
      <Field label="LinkedIn page" hint="Optional." error={errors.linkedinUrl}>
        <Input {...register("linkedinUrl")} type="url" inputMode="url" spellCheck={false} />
      </Field>
      <Field
        label="About the company"
        hint={`Shown under every job you post. ${String(pitchLength)} of ${String(LIMITS.companyPitchMaxLength)} characters.`}
        error={errors.pitch}
      >
        <Textarea {...register("pitch")} rows={5} maxLength={LIMITS.companyPitchMaxLength} />
      </Field>
      <Field
        label="Logo URL"
        hint="Optional. We keep it with your profile, but job pages show your initials for now: PitchPerfect doesn’t load images from other sites."
        error={errors.logoUrl}
      >
        <Input {...register("logoUrl")} type="url" inputMode="url" spellCheck={false} />
      </Field>
      <SubmitRow label="Save company" submitting={submitting} formError={formError} />
      <SettingsNews news={news} />
    </form>
  );
}

/** The company profile students see on every job, and where its verification stands. */
export function CompanyForm() {
  const company = useApi("/employer/company", OneCompany);
  if (company.state === "loading") return <Loading label="Loading your company" lines={5} />;
  if (company.state === "error") return <LoadError what="your company" onRetry={company.reload} />;
  const current = company.data;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-4">
        <CompanyMark name={current.name} />
        <div className="min-w-0">
          <h2 className="text-h3 [overflow-wrap:anywhere]">{current.name}</h2>
          <div className="mt-1">
            <CompanyBadge verification={current.verification} />
          </div>
        </div>
      </div>
      <VerificationBanner verification={current.verification} website={current.website} />
      <Card className="md:p-8">
        <CompanyFields
          key={current.id}
          company={current}
          onSaved={(saved) => {
            company.update(() => saved);
          }}
        />
      </Card>
    </div>
  );
}
