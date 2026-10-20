"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { ApiError } from "./api";

/** What a form field holds: text (inputs, selects) or a checkbox's state. */
export type FormValue = string | boolean;
export type FormValues = Record<string, FormValue>;
export type FieldErrors = Record<string, string>;

/** The parts of a zod issue the messages need; zod's own issues fit this shape. */
interface Issue {
  code: string;
  path: PropertyKey[];
  message: string;
  input?: unknown;
  origin?: string;
  format?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  inclusive?: boolean;
}

/** Anything with zod's `safeParse`, so the shared schemas can be passed straight in. */
export interface FormSchema<T> {
  safeParse(
    data: unknown,
  ): { success: true; data: T } | { success: false; error: { issues: readonly Issue[] } };
}

interface FormOptions {
  /** Every field's starting value, keyed by its path: `email`, `company.website`. */
  initial: FormValues;
  /** The message for a field left empty (or a box left unticked), by path. */
  required?: Record<string, string>;
  /** Last step before validation, e.g. turning a select's text into a number. */
  toInput?: (input: Record<string, unknown>) => Record<string, unknown>;
  /** Form-level wording for api error codes, e.g. sign-in's `invalid_credentials`. */
  apiMessages?: Record<string, string>;
}

type FieldChange = ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;

export interface RegisteredField {
  name: string;
  value?: string;
  checked?: boolean;
  onChange: (event: FieldChange) => void;
}

const REQUIRED = "This field is required";
const CHECK_FIELDS = "Check the highlighted fields.";
const UNEXPECTED = "Something went wrong. Try again.";

/** For a `429 rate_limited`: how long to wait, from `Retry-After`, in whole minutes. */
function waitMessage(retryAfterSec: number | undefined): string {
  if (retryAfterSec === undefined) return "Too many attempts. Try again in a few minutes.";
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Too many attempts. Try again in ${String(minutes)} minute${minutes === 1 ? "" : "s"}.`;
}

/** The message for a failed request: the form's own wording, a wait time, or the api's text. */
export function formMessage(error: unknown, apiMessages: Record<string, string> = {}): string {
  if (!(error instanceof ApiError)) return UNEXPECTED;
  const own = apiMessages[error.code];
  if (own !== undefined) return own;
  if (error.code === "rate_limited") return waitMessage(error.retryAfterSec);
  return error.message;
}

/** A readable message for one schema issue. */
function messageFor(issue: Issue, path: string, required: Record<string, string>): string {
  const missing = required[path] ?? REQUIRED;
  switch (issue.code) {
    case "invalid_type":
      return issue.input === undefined ? missing : issue.message;
    case "invalid_value":
      return missing;
    case "too_small":
      if (issue.origin === "number") {
        return issue.inclusive === false
          ? `Enter a number above ${String(issue.minimum)}`
          : `Enter ${String(issue.minimum)} or more`;
      }
      if (issue.origin !== "string") return issue.message;
      return Number(issue.minimum) <= 1
        ? missing
        : `Use at least ${String(issue.minimum)} characters`;
    case "too_big":
      if (issue.origin === "number")
        return `Enter ${Number(issue.maximum).toLocaleString("en-US")} or less`;
      return issue.origin === "string"
        ? `Use ${String(issue.maximum)} characters or fewer`
        : issue.message;
    case "invalid_format":
      if (issue.format === "email") return "Enter a valid email address";
      if (issue.format === "url") return "Enter a full web address that starts with https://";
      if (issue.format === "regex") return "Use letters, spaces, apostrophes, hyphens or periods";
      return issue.message;
    default:
      // Refinements carry the shared schema's own sentence.
      return issue.message;
  }
}

/**
 * Turns flat form values into the schema's input: empty text becomes "not given" (so optional
 * fields can be left blank), and dotted paths become nested objects.
 */
function toNested(values: FormValues): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(values)) {
    if (typeof value === "string" && value.trim() === "") continue;
    const keys = path.split(".");
    const last = keys.pop() ?? path;
    let node = root;
    for (const key of keys) {
      const child = node[key];
      const next = typeof child === "object" && child !== null ? child : {};
      node[key] = next;
      node = next as Record<string, unknown>;
    }
    node[last] = value;
  }
  return root;
}

/** "Invalid token" → "Invalid token." so messages can be joined into one paragraph. */
const asSentence = (message: string) => (/[.!?]$/.test(message) ? message : `${message}.`);

/**
 * Server field errors split into the ones this form has a field for and the rest (e.g. a link's
 * `token`), which would otherwise vanish behind an empty "check the highlighted fields".
 */
function splitFields(fields: FieldErrors, initial: FormValues) {
  const known: FieldErrors = {};
  const others: string[] = [];
  for (const [path, message] of Object.entries(fields)) {
    if (path in initial) known[path] = message;
    else others.push(message);
  }
  return { known, others };
}

/** Focuses the first control, in page order, that has an error. */
function focusFirstError(form: HTMLFormElement | null, errors: FieldErrors) {
  if (!form) return;
  const controls = form.querySelectorAll<HTMLElement>("input[name], select[name], textarea[name]");
  for (const control of controls) {
    const name = control.getAttribute("name");
    if (name !== null && name in errors) {
      control.focus();
      return;
    }
  }
}

/** The `value` of the button that submitted the form, e.g. "publish" beside "save". */
function submitterValue(event: unknown): string | undefined {
  if (typeof SubmitEvent === "undefined" || !(event instanceof SubmitEvent)) return undefined;
  return event.submitter instanceof HTMLButtonElement && event.submitter.value !== ""
    ? event.submitter.value
    : undefined;
}

/**
 * The one form hook: values keyed by field path, validation with a shared zod schema, readable
 * per-field messages, server field errors, and a form-level message for everything else.
 *
 * `onSubmit` gets the parsed data, and the `value` of the submit button that was used (forms
 * with two, like "Save draft" and "Publish"). If it throws an `ApiError` with `fields` (`validation_failed`),
 * those land on their fields; codes in `apiMessages` get the form's own wording; a `rate_limited`
 * one says how long to wait; any other error shows the api's message as `formError`.
 */
export function useZodForm<T>(
  schema: FormSchema<T>,
  onSubmit: (data: T, action?: string) => Promise<void> | void,
  { initial, required = {}, toInput = (input) => input, apiMessages = {} }: FormOptions,
) {
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // State lags inside one event loop turn; the ref stops a double submit for certain.
  const busy = useRef(false);

  function setValue(name: string, value: FormValue) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) =>
      name in current
        ? Object.fromEntries(Object.entries(current).filter(([key]) => key !== name))
        : current,
    );
  }

  function register(name: string): RegisteredField {
    const value = values[name];
    if (typeof value === "boolean") {
      return {
        name,
        checked: value,
        onChange: (event) => {
          setValue(name, (event.target as HTMLInputElement).checked);
        },
      };
    }
    return {
      name,
      value: value ?? "",
      onChange: (event) => {
        setValue(name, event.target.value);
      },
    };
  }

  function setServerErrors(fields: FieldErrors) {
    setErrors(fields);
  }

  async function handleSubmit(event?: {
    preventDefault: () => void;
    currentTarget?: unknown;
    nativeEvent?: unknown;
  }) {
    event?.preventDefault();
    if (busy.current) return;
    const form = event?.currentTarget instanceof HTMLFormElement ? event.currentTarget : null;
    const action = submitterValue(event?.nativeEvent);

    const parsed = schema.safeParse(toInput(toNested(values)));
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.map(String).join(".") || "_";
        next[path] ??= messageFor(issue, path, required);
      }
      setErrors(next);
      setFormError(null);
      focusFirstError(form, next);
      return;
    }

    busy.current = true;
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    try {
      await (action === undefined ? onSubmit(parsed.data) : onSubmit(parsed.data, action));
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
        const { known, others } = splitFields(error.fields, initial);
        setErrors(known);
        setFormError(
          [Object.keys(known).length > 0 ? CHECK_FIELDS : null, ...others.map(asSentence)]
            .filter(Boolean)
            .join(" "),
        );
        focusFirstError(form, known);
      } else {
        setFormError(formMessage(error, apiMessages));
      }
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  return {
    values,
    errors,
    formError,
    submitting,
    register,
    setValue,
    handleSubmit,
    setServerErrors,
  };
}
