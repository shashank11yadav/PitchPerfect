"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const focusableIn = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hidden);

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * A modal dialog: focus moves in on open, Tab and Shift+Tab stay inside, Escape and the close
 * button call `onClose`, and focus returns to whatever had it before, unless that is gone or the
 * page has already moved focus somewhere on purpose. The page behind stops scrolling; a dialog
 * taller than the screen (a phone, or a phone with its keyboard up) scrolls inside itself, and its
 * buttons, in `ModalActions`, stay pinned to its bottom edge while the rest scrolls.
 */
export function Modal({ open, onClose, title, description, children, className }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const [first] = bodyRef.current ? focusableIn(bodyRef.current) : [];
    // Without scrolling, so the dialog opens on its heading even when the first control is a
    // button in the pinned `ModalActions` bar, which is in view wherever the body is scrolled.
    (first ?? focusableIn(dialog)[0] ?? dialog).focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusableIn(dialog);
      const head = items[0];
      const tail = items.at(-1);
      if (!head || !tail) {
        event.preventDefault();
        return;
      }
      const active = document.activeElement;
      if (!dialog.contains(active)) {
        event.preventDefault();
        head.focus();
      } else if (event.shiftKey && (active === head || active === dialog)) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && active === tail) {
        event.preventDefault();
        head.focus();
      }
    };

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      // Back to whatever opened it, if that still exists and nothing else has taken focus since
      // (a page that moved focus to news about the dialog's outcome keeps it there).
      const active = document.activeElement;
      const focusIsFree = !active || active === document.body || dialog.contains(active);
      if (focusIsFree && previous?.isConnected) previous.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 p-4 sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          // The scroll padding keeps a focused control clear of the pinned `ModalActions` bar.
          "max-h-[calc(100dvh-2rem)] w-full max-w-lg scroll-pb-36 overflow-y-auto overscroll-contain rounded-card bg-surface p-6 shadow-card-hover focus:outline-none sm:scroll-pb-24",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-h4">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-3 flex size-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-surface-2 hover:text-ink"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        {description && (
          <p id={descriptionId} className="mt-2 text-muted">
            {description}
          </p>
        )}
        <div ref={bodyRef} className="mt-6">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * A dialog's buttons, last in its content: they stick to the bottom of the dialog while the body
 * scrolls under them, so they are in view on a short screen without scrolling. The bar spans the
 * dialog's padding and sticks to its outer edge (a sticky offset counts from inside the padding),
 * so it covers what scrolls beneath it. On a phone the main action is on top.
 */
export function ModalActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky -bottom-6 -mx-6 -mb-6 flex flex-col-reverse gap-3 border-t border-border bg-surface px-6 py-4 sm:flex-row sm:justify-end">
      {children}
    </div>
  );
}
