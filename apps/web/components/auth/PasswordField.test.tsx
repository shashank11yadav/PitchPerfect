import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PasswordField } from "./PasswordField";

function Controlled({ strength = false }: { strength?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <PasswordField
      name="password"
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
      }}
      autoComplete={strength ? "new-password" : "current-password"}
      strengthHint={strength}
    />
  );
}

describe("PasswordField", () => {
  it("hides the password until the toggle is pressed, and announces the toggle's state", async () => {
    render(<Controlled />);
    const input = screen.getByLabelText(/^password/i);
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(input).toHaveAttribute("type", "password");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toHaveAttribute("aria-controls", input.id);

    await userEvent.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("works from the keyboard with Enter and Space", async () => {
    render(<Controlled />);
    const input = screen.getByLabelText(/^password/i);
    await userEvent.tab();
    expect(input).toHaveFocus();
    await userEvent.tab();
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(input).toHaveAttribute("type", "text");
    await userEvent.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(input).toHaveAttribute("type", "password");
  });

  it("gives a length-only hint for new passwords, linked to the input", async () => {
    render(<Controlled strength />);
    const input = screen.getByLabelText(/^password/i);
    expect(input).toHaveAccessibleDescription(/at least 12 characters/i);
    await userEvent.type(input, "abcdefgh");
    expect(input).toHaveAccessibleDescription(/4 more to go/i);
    await userEvent.type(input, "ijkl");
    expect(input).toHaveAccessibleDescription(/long enough/i);
  });

  it("has no strength hint when signing in", () => {
    render(<Controlled />);
    expect(screen.getByLabelText(/^password/i)).not.toHaveAccessibleDescription(/characters/i);
  });
});
