"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { FieldError, FieldHint, describedByIds } from "./Field";

interface RadioOption {
  value: string;
  label: ReactNode;
}

interface RadioGroupProps {
  legend: ReactNode;
  name: string;
  options: readonly RadioOption[];
  /** Controlled value; leave out and use `defaultValue` for an uncontrolled group. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
}

/** Native radios in a fieldset, so arrow keys and the legend work as browsers expect. */
export function RadioGroup({
  legend,
  name,
  options,
  value,
  defaultValue,
  onChange,
  hint,
  error,
  required = false,
  className,
}: RadioGroupProps) {
  const id = useId();
  const describedBy = describedByIds({ id, hint, error });
  return (
    <fieldset aria-describedby={describedBy} className={cn("flex flex-col gap-2", className)}>
      <legend className="mb-1 text-small font-semibold text-ink">
        {legend}
        {required && (
          <span aria-hidden="true" className="text-danger">
            {" *"}
          </span>
        )}
      </legend>
      <FieldHint id={id} hint={hint} />
      {options.map((option) => {
        const optionId = `${id}-${option.value}`;
        return (
          <div key={option.value} className="flex items-center gap-3">
            <input
              type="radio"
              id={optionId}
              name={name}
              value={option.value}
              required={required}
              {...(value === undefined
                ? { defaultChecked: option.value === defaultValue }
                : { checked: option.value === value })}
              onChange={() => onChange?.(option.value)}
              className="size-5 shrink-0 accent-primary"
            />
            <label htmlFor={optionId} className="text-body text-ink">
              {option.label}
            </label>
          </div>
        );
      })}
      <FieldError id={id} error={error} />
    </fieldset>
  );
}
