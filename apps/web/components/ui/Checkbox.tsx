"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { FieldError, FieldHint, describedByIds } from "./Field";

interface CheckboxProps extends Omit<ComponentProps<"input">, "type"> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

/** A checkbox with its own visible label, hint and linked error. */
export function Checkbox({ label, hint, error, id, className, ...props }: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-start gap-3">
        <input
          {...props}
          type="checkbox"
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedByIds({ id: inputId, hint, error })}
          className="mt-1 size-5 shrink-0 accent-primary"
        />
        <label htmlFor={inputId} className="text-body text-ink">
          {label}
        </label>
      </div>
      <FieldHint id={inputId} hint={hint} />
      <FieldError id={inputId} error={error} />
    </div>
  );
}
