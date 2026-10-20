import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { ToastProvider, useToast } from "./Toast";

function SaveButton() {
  const toast = useToast();
  return (
    <Button
      onClick={() => {
        toast({ title: "Saved", tone: "success" });
      }}
    >
      Save
    </Button>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Toast", () => {
  it("announces messages in a polite live region and dismisses them later", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <SaveButton />
      </ToastProvider>,
    );
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();

    act(() => {
      screen.getByRole("button", { name: "Save" }).click();
    });
    expect(region).toHaveTextContent("Saved");

    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(region).toBeEmptyDOMElement();
  });

  it("can be dismissed by its button", () => {
    render(
      <ToastProvider>
        <SaveButton />
      </ToastProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "Save" }).click();
    });
    act(() => {
      screen.getByRole("button", { name: "Dismiss" }).click();
    });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("requires a provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<SaveButton />)).toThrow("useToast needs a ToastProvider");
  });
});
