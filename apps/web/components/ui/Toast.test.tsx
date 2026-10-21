import { act, fireEvent, render, screen } from "@testing-library/react";
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

  it("stops the clock while the pointer is over the message, and restarts it after", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <SaveButton />
      </ToastProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "Save" }).click();
    });
    const message = screen.getByText("Saved").closest("[data-toast]");
    if (!message) throw new Error("toast not rendered");

    act(() => {
      fireEvent.mouseEnter(message);
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saved");

    act(() => {
      fireEvent.mouseLeave(message);
      vi.advanceTimersByTime(7_999);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("stops the clock while the message has keyboard focus", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <SaveButton />
      </ToastProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "Save" }).click();
    });
    act(() => {
      screen.getByRole("button", { name: "Dismiss" }).focus();
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saved");

    act(() => {
      screen.getByRole("button", { name: "Save" }).focus();
      vi.advanceTimersByTime(8000);
    });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("keeps holding when the pointer leaves while focus is still inside", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <SaveButton />
      </ToastProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "Save" }).click();
    });
    const message = screen.getByText("Saved").closest("[data-toast]");
    if (!message) throw new Error("toast not rendered");

    act(() => {
      screen.getByRole("button", { name: "Dismiss" }).focus();
      fireEvent.mouseEnter(message);
      fireEvent.mouseLeave(message);
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saved");

    act(() => {
      screen.getByRole("button", { name: "Save" }).focus();
      vi.advanceTimersByTime(8000);
    });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
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
