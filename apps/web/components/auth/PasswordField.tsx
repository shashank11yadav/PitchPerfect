"use client";

import { LIMITS } from "@pitchperfect/shared";
import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type ComponentProps } from "react";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";

interface PasswordFieldProps extends Omit<ComponentProps<"input">, "type" | "value" | "id"> {
  value?: string | undefined;
  label?: string;
  error?: string | undefined;
  /** New passwords: a hint that counts toward the minimum length. Length is all it judges. */
  strengthHint?: boolean;
}

const MIN = LIMITS.passwordMinLength;

/** Length only: the api is the authority, and also checks the password against known breaches. */
function lengthHint(length: number): string {
  if (length === 0) {
    return `At least ${String(MIN)} characters. A few ordinary words are easier to remember than a jumble.`;
  }
  if (length < MIN) {
    return `At least ${String(MIN)} characters: ${String(MIN - length)} more to go.`;
  }
  return "That's long enough. Another word or two would make it harder to guess.";
}

/** A password input with a show/hide toggle (`aria-pressed`) and an optional length hint. */
export function PasswordField({
  value = "",
  label = "Password",
  error,
  strengthHint = false,
  required = true,
  ...props
}: PasswordFieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <Field
      id={id}
      label={label}
      error={error}
      required={required}
      hint={strengthHint ? lengthHint(value.length) : undefined}
    >
      <div className="relative">
        <Input
          {...props}
          value={value}
          type={visible ? "text" : "password"}
          spellCheck={false}
          autoCapitalize="none"
          className="pr-12"
        />
        <button
          type="button"
          aria-label="Show password"
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => {
            setVisible((shown) => !shown);
          }}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-control text-muted hover:text-primary"
        >
          <Icon aria-hidden="true" className="size-5" />
        </button>
      </div>
    </Field>
  );
}
