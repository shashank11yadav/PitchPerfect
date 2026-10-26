import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";
import { Modal } from "./Modal";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Delete attempt
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Delete this attempt?"
        description="This can't be undone."
      >
        <Button
          onClick={() => {
            setOpen(false);
          }}
        >
          Cancel
        </Button>
        <Button variant="danger">Delete</Button>
      </Modal>
    </>
  );
}

async function openModal() {
  const user = userEvent.setup();
  render(<Harness />);
  const trigger = screen.getByRole("button", { name: "Delete attempt" });
  await user.click(trigger);
  return { user, trigger };
}

describe("Modal", () => {
  it("renders nothing while closed", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is a labelled modal dialog that takes focus when opened", async () => {
    await openModal();
    const dialog = screen.getByRole("dialog", { name: "Delete this attempt?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("This can't be undone.");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("traps focus inside the dialog in both directions", async () => {
    const { user } = await openModal();
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    for (let i = 0; i < 6; i++) {
      await user.tab({ shift: true });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("stops the page scrolling while open, and gives it back on close", async () => {
    document.body.style.overflow = "auto";
    const { user } = await openModal();
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).toBe("auto");
    document.body.style.overflow = "";
  });

  it("fits the screen and scrolls inside itself when its content is taller", async () => {
    await openModal();
    // The overlay pads 1rem on each side; the dialog stays within what is left of the screen.
    expect(screen.getByRole("dialog")).toHaveClass("max-h-[calc(100dvh-2rem)]", "overflow-y-auto");
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const { user, trigger } = await openModal();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes from its close button and returns focus to the trigger", async () => {
    const { user, trigger } = await openModal();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("leaves focus alone when the trigger is gone or the page moved it on purpose", async () => {
    function Outcome() {
      const [open, setOpen] = useState(false);
      const [done, setDone] = useState(false);
      return (
        <>
          {!done && (
            <Button
              onClick={() => {
                setOpen(true);
              }}
            >
              Remove
            </Button>
          )}
          <p tabIndex={-1} id="outcome">
            {done ? "Removed." : ""}
          </p>
          <Modal
            open={open}
            onClose={() => {
              setOpen(false);
            }}
            title="Remove it?"
          >
            <Button
              onClick={() => {
                setDone(true);
                document.getElementById("outcome")?.focus();
                setOpen(false);
              }}
            >
              Yes, remove
            </Button>
          </Modal>
        </>
      );
    }
    render(<Outcome />);
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.getElementById("outcome")).toHaveFocus();
  });
});
