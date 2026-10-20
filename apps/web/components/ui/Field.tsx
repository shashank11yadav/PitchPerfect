"use client";

import { CircleAlert } from "lucide-react";
import { createContext, use, useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface FieldControl {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldControl | null>(null);

/** Shared look of text-like controls (Input, Textarea, Select). */
export const CONTROL_CLASSES = cn(
  "w-full rounded-control border border-muted bg-surface px-3.5 text-body text-ink",
  "placeholder:text-muted disabled:cursor-not-allowed disabled:bg-surface-2",
  "aria-invalid:border-danger",
);

interface ControlProps {
  id?: string | undefined;
  required?: boolean | undefined;
  "aria-describedby"?: string | undefined;
}

const joinIds = (...ids: (string | false | null | undefined)[]) =>
  ids.filter(Boolean).join(" ") || undefined;

/** The id, required flag and descriptions a control gets from its surrounding `Field`. */
export function useFieldControl(props: ControlProps) {
  const field = use(FieldContext);
  return {
    id: props.id ?? field?.id,
    required: props.required ?? field?.required,
    "aria-invalid": field?.invalid === true ? true : undefined,
    "aria-describedby": joinIds(props["aria-describedby"], field?.describedBy),
  };
}

interface Messages {
  id: string;
  hint?: ReactNode;
  error?: ReactNode;
}

/** The ids `aria-describedby` should list for a hint and an error. */
export function describedByIds({ id, hint, error }: Messages) {
  return joinIds(Boolean(hint) && `${id}-hint`, Boolean(error) && `${id}-error`);
}

export function FieldHint({ id, hint }: Messages) {
  if (!hint) return null;
  return (
    <p id={`${id}-hint`} className="text-small text-muted">
      {hint}
    </p>
  );
}

/**
 * Not an alert: it's read as the control's description, and focus moves to the first invalid
 * control. The form's own message is the one alert, so several errors don't all speak at once.
 */
export function FieldError({ id, error }: Messages) {
  if (!error) return null;
  return (
    <p id={`${id}-error`} className="flex items-start gap-1.5 text-small text-danger">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{error}</span>
    </p>
  );
}

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Defaults to a generated id. */
  id?: string;
  className?: string;
  /** One `Input`, `Textarea` or `Select`. */
  children: ReactNode;
}

/** A visible label, the control, an optional hint, and an error linked by `aria-describedby`. */
export function Field({
  label,
  hint,
  error,
  required = false,
  id,
  className,
  children,
}: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const control: FieldControl = {
    id: controlId,
    describedBy: describedByIds({ id: controlId, hint, error }),
    invalid: Boolean(error),
    required,
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={controlId} className="text-small font-semibold text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="text-danger">
            {" *"}
          </span>
        )}
      </label>
      <FieldHint id={controlId} hint={hint} />
      <FieldContext value={control}>{children}</FieldContext>
      <FieldError id={controlId} error={error} />
    </div>
  );
}
