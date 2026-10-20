"use client";

import { SKILLS, isSkillSlug, type SkillSlug } from "@pitchperfect/shared";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";

interface SkillSelectProps {
  label: string;
  value: SkillSlug | undefined;
  onSelect: (skill: SkillSlug | undefined) => void;
  /** An extra first option for "any skill"; without it a skill must be picked. */
  allLabel?: string;
  className?: string;
}

/** A labelled dropdown of the eight skills. */
export function SkillSelect({ label, value, onSelect, allLabel, className }: SkillSelectProps) {
  return (
    <Field label={label} className={className}>
      <Select
        value={value ?? ""}
        onChange={(event) => {
          const next = event.target.value;
          onSelect(isSkillSlug(next) ? next : undefined);
        }}
      >
        {allLabel !== undefined && <option value="">{allLabel}</option>}
        {SKILLS.map((option) => (
          <option key={option.slug} value={option.slug}>
            {option.title}
          </option>
        ))}
      </Select>
    </Field>
  );
}
