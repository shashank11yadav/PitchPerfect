import { ForgotPasswordSchema, LIMITS, PaySchema, SignupSchema } from "@pitchperfect/shared";
import { act, renderHook } from "@testing-library/react";
import type { ChangeEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import { useZodForm } from "./use-form";

/** The employer half of the shared signup schema: nested company fields and an optional URL. */
const employerInitial = {
  role: "employer",
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  jobTitle: "",
  "company.name": "",
  "company.website": "",
  "company.linkedinUrl": "",
};

const studentInitial = {
  role: "student",
  firstName: "Sam",
  lastName: "Ortiz",
  email: "sam@example.test",
  password: "a long passphrase",
  school: "Lakeside College",
  major: "Business",
  gradYear: "",
  targetRole: "Sales development representative",
  industry: "Software",
  state: "MA",
  ageConfirmed: false,
};

const fakeEvent = () => ({ preventDefault: vi.fn() });
const change = (value: string) => ({ target: { value } }) as ChangeEvent<HTMLInputElement>;
const tick = (checked: boolean) => ({ target: { checked } }) as ChangeEvent<HTMLInputElement>;
const asYear = (input: Record<string, unknown>) => ({
  ...input,
  gradYear: input.gradYear === undefined ? undefined : Number(input.gradYear),
});

const employerForm = (onSubmit = vi.fn()) =>
  renderHook(() =>
    useZodForm(SignupSchema, onSubmit, {
      initial: employerInitial,
      required: { email: "Enter your work email" },
    }),
  );

const studentForm = (onSubmit = vi.fn()) =>
  renderHook(() =>
    useZodForm(SignupSchema, onSubmit, {
      initial: studentInitial,
      required: { ageConfirmed: "Confirm that you're 18 or older" },
      toInput: asYear,
    }),
  );

const nameForm = (onSubmit: () => Promise<void>) =>
  renderHook(() =>
    useZodForm(ForgotPasswordSchema, onSubmit, { initial: { email: "sam@example.test" } }),
  );

describe("useZodForm", () => {
  it("binds text inputs and checkboxes through register", () => {
    const { result } = studentForm();
    expect(result.current.register("school")).toMatchObject({
      name: "school",
      value: "Lakeside College",
    });
    expect(result.current.register("ageConfirmed")).toMatchObject({
      name: "ageConfirmed",
      checked: false,
    });
    expect(result.current.register("ageConfirmed")).not.toHaveProperty("value");

    act(() => {
      result.current.register("school").onChange(change("Hillcrest University"));
      result.current.register("ageConfirmed").onChange(tick(true));
    });
    expect(result.current.values.school).toBe("Hillcrest University");
    expect(result.current.values.ageConfirmed).toBe(true);
  });

  it("validates with the schema and gives readable messages per field, without submitting", async () => {
    const onSubmit = vi.fn();
    const { result } = employerForm(onSubmit);
    act(() => {
      result.current.register("password").onChange(change("short"));
      result.current.register("company.website").onChange(change("http://quarrow.example.test"));
    });
    const event = fakeEvent();
    await act(() => result.current.handleSubmit(event));

    expect(event.preventDefault).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.errors).toMatchObject({
      firstName: "This field is required",
      email: "Enter your work email",
      password: "Use at least 12 characters",
      "company.name": "This field is required",
      "company.website": "Enter a full web address that starts with https://",
    });
    // Optional fields left empty are not errors.
    expect(result.current.errors).not.toHaveProperty("company.linkedinUrl");
  });

  it("uses the form's own message for a required checkbox and a missing choice", async () => {
    const { result } = studentForm();
    await act(() => result.current.handleSubmit(fakeEvent()));
    expect(result.current.errors).toEqual({
      ageConfirmed: "Confirm that you're 18 or older",
      gradYear: "This field is required",
    });
  });

  it("submits nested, typed data and tracks submitting", async () => {
    let finish: () => void = () => undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = employerForm(onSubmit);
    act(() => {
      const { register } = result.current;
      register("firstName").onChange(change("Avery"));
      register("lastName").onChange(change("Lin"));
      register("email").onChange(change(" Avery@Quarrow.example.test "));
      register("password").onChange(change("a long passphrase"));
      register("jobTitle").onChange(change("Sales manager"));
      register("company.name").onChange(change("Quarrow Logistics Software"));
      register("company.website").onChange(change("https://quarrow.example.test"));
    });

    let submitted: Promise<void> = Promise.resolve();
    act(() => {
      submitted = result.current.handleSubmit(fakeEvent());
    });
    expect(result.current.submitting).toBe(true);
    expect(onSubmit).toHaveBeenCalledWith({
      role: "employer",
      firstName: "Avery",
      lastName: "Lin",
      email: "avery@quarrow.example.test",
      password: "a long passphrase",
      jobTitle: "Sales manager",
      company: { name: "Quarrow Logistics Software", website: "https://quarrow.example.test" },
    });
    await act(async () => {
      finish();
      await submitted;
    });
    expect(result.current.submitting).toBe(false);
  });

  it("converts values with toInput before validating", async () => {
    const onSubmit = vi.fn();
    const { result } = studentForm(onSubmit);
    act(() => {
      result.current.register("gradYear").onChange(change(String(new Date().getUTCFullYear())));
      result.current.register("ageConfirmed").onChange(tick(true));
    });
    await act(() => result.current.handleSubmit(fakeEvent()));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ gradYear: new Date().getUTCFullYear(), ageConfirmed: true }),
    );
  });

  it("says what's wrong with a number in words", async () => {
    const asPay = (input: Record<string, unknown>) => ({
      type: "exact",
      amount: Number(input.amount),
      currency: "USD",
      frequency: "hourly",
      commission: false,
    });
    const { result } = renderHook(() =>
      useZodForm(PaySchema, vi.fn(), { initial: { amount: "0" }, toInput: asPay }),
    );
    await act(() => result.current.handleSubmit(fakeEvent()));
    expect(result.current.errors.amount).toBe("Enter a number above 0");
    act(() => {
      result.current.register("amount").onChange(change(String(LIMITS.payMax + 1)));
    });
    await act(() => result.current.handleSubmit(fakeEvent()));
    expect(result.current.errors.amount).toBe("Enter 10,000,000 or less");
  });

  it("passes on the value of the button that submitted the form", async () => {
    const onSubmit = vi.fn();
    const { result } = nameForm(onSubmit);
    const form = document.createElement("form");
    const publish = document.createElement("button");
    publish.value = "publish";
    form.append(publish);
    const nativeEvent = new SubmitEvent("submit", { submitter: publish });
    await act(() =>
      result.current.handleSubmit({ ...fakeEvent(), currentTarget: form, nativeEvent }),
    );
    expect(onSubmit).toHaveBeenCalledWith({ email: "sam@example.test" }, "publish");
  });

  it("clears a field's error when it changes", async () => {
    const { result } = employerForm();
    await act(() => result.current.handleSubmit(fakeEvent()));
    expect(result.current.errors.email).toBeDefined();
    act(() => {
      result.current.register("email").onChange(change("a"));
    });
    expect(result.current.errors.email).toBeUndefined();
  });

  it("shows server field errors, and a form-level message for other api errors", async () => {
    const { result } = employerForm();
    act(() => {
      result.current.setServerErrors({ password: "Choose a password that hasn't been leaked" });
    });
    expect(result.current.errors.password).toBe("Choose a password that hasn't been leaked");

    const onSubmit = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(
        new ApiError(400, "validation_failed", "Some fields need attention", {
          email: "Use your work email",
        }),
      )
      .mockRejectedValueOnce(new ApiError(500, "internal_error", "Something went wrong"));
    const form = nameForm(onSubmit);
    await act(() => form.result.current.handleSubmit(fakeEvent()));
    expect(form.result.current.errors.email).toBe("Use your work email");
    expect(form.result.current.formError).toBe("Check the highlighted fields.");

    await act(() => form.result.current.handleSubmit(fakeEvent()));
    expect(form.result.current.formError).toBe("Something went wrong");
  });

  it("shows field errors the form has no field for as the form-level message", async () => {
    const onSubmit = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(
        new ApiError(400, "validation_failed", "Some fields need attention", {
          token: "Invalid token",
        }),
      )
      .mockRejectedValueOnce(
        new ApiError(400, "validation_failed", "Some fields need attention", {
          email: "Use your work email",
          file: "Send one PDF in the file field",
        }),
      );
    const { result } = nameForm(onSubmit);

    await act(() => result.current.handleSubmit(fakeEvent()));
    expect(result.current.errors).toEqual({});
    expect(result.current.formError).toBe("Invalid token.");

    await act(() => result.current.handleSubmit(fakeEvent()));
    expect(result.current.errors).toEqual({ email: "Use your work email" });
    expect(result.current.formError).toBe(
      "Check the highlighted fields. Send one PDF in the file field.",
    );
  });

  it("ignores a second submit while the first is running", () => {
    const onSubmit = vi.fn(() => new Promise<void>(() => undefined));
    const { result } = nameForm(onSubmit);
    act(() => {
      void result.current.handleSubmit(fakeEvent());
    });
    act(() => {
      void result.current.handleSubmit(fakeEvent());
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
