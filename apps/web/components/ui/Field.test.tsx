import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field } from "./Field";
import { Input } from "./Input";
import { Select } from "./Select";
import { Textarea } from "./Textarea";

describe("Field", () => {
  it("links a visible <label for> to its input", () => {
    render(
      <Field label="Email">
        <Input name="email" type="email" />
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input.tagName).toBe("INPUT");
    const label = screen.getByText("Email").closest("label");
    expect(label).toHaveAttribute("for", input.id);
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("describes the control by its hint and error and marks it invalid", () => {
    render(
      <Field label="Password" hint="12 to 128 characters." error="Password is too short.">
        <Input name="password" type="password" />
      </Field>,
    );
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("12 to 128 characters. Password is too short.");
    // Field errors are read through the description; only the form-level message is an alert,
    // so a form with several errors doesn't fire a burst of announcements.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("marks required fields on the control and in the label", () => {
    render(
      <Field label="School" required>
        <Input name="school" />
      </Field>,
    );
    expect(screen.getByLabelText(/School/)).toBeRequired();
  });

  it("wraps a textarea and a select the same way", () => {
    render(
      <>
        <Field label="Pitch" error="Too long.">
          <Textarea name="pitch" />
        </Field>
        <Field label="State">
          <Select name="state" defaultValue="">
            <option value="">Choose a state</option>
            <option value="CA">California</option>
          </Select>
        </Field>
      </>,
    );
    expect(screen.getByLabelText("Pitch").tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText("Pitch")).toHaveAccessibleDescription("Too long.");
    expect(screen.getByLabelText("State").tagName).toBe("SELECT");
  });
});
