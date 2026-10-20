import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./Checkbox";
import { RadioGroup } from "./RadioGroup";

describe("Checkbox", () => {
  it("has its own label and a linked error", () => {
    render(<Checkbox name="age" label="I am 18 or older" error="You must be 18 or older." />);
    const box = screen.getByRole("checkbox", { name: "I am 18 or older" });
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription("You must be 18 or older.");
  });
});

describe("RadioGroup", () => {
  const OPTIONS = [
    { value: "student", label: "Student" },
    { value: "employer", label: "Employer" },
  ];

  it("groups native radios under a legend and reports changes", async () => {
    const onChange = vi.fn();
    render(
      <RadioGroup
        legend="I am a"
        name="role"
        options={OPTIONS}
        value="student"
        onChange={onChange}
        hint="You can't change this later."
      />,
    );
    const group = screen.getByRole("group", { name: "I am a" });
    expect(group).toHaveAccessibleDescription("You can't change this later.");
    expect(screen.getByRole("radio", { name: "Student" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Employer" }));
    expect(onChange).toHaveBeenCalledWith("employer");
  });

  it("supports an uncontrolled default", () => {
    render(<RadioGroup legend="Role" name="role" options={OPTIONS} defaultValue="employer" />);
    expect(screen.getByRole("radio", { name: "Employer" })).toBeChecked();
  });
});
