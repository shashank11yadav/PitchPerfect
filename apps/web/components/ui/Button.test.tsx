import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("is a type=button by default and calls onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("type", "button");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is aria-busy and disabled while loading, keeping its accessible name", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("applies the variant and size styles", () => {
    render(
      <Button variant="danger" size="lg">
        Delete
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Delete" });
    expect(button.className).toContain("bg-danger");
    expect(button.className).toContain("h-12");
  });

  it("has inverse variants for navy backgrounds", () => {
    render(
      <>
        <Button variant="inverse">Start</Button>
        <Button variant="inverse-outline">Learn more</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Start" }).className).toContain("bg-white");
    expect(screen.getByRole("button", { name: "Learn more" }).className).toContain("border-white");
  });
});
