"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "danger";

interface ToastInput {
  title: string;
  description?: string;
  tone?: Tone;
}

interface ToastItem extends ToastInput {
  id: number;
}

/** Long enough to read a sentence twice; every toast can also be dismissed. */
const DISMISS_AFTER_MS = 8000;

const ICONS = { info: Info, success: CircleCheck, danger: CircleAlert } as const;
const ACCENTS: Record<Tone, string> = {
  info: "text-primary",
  success: "text-success",
  danger: "text-danger",
};

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

/** Shows short messages in a polite live region that exists before any message arrives. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  /** Starts (or restarts) a toast's clock; `pause` stops it while the reader is on the message. */
  const start = useCallback(
    (id: number) => {
      clearTimeout(timers.current.get(id));
      timers.current.set(
        id,
        setTimeout(() => {
          dismiss(id);
        }, DISMISS_AFTER_MS),
      );
    },
    [dismiss],
  );
  const pause = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...toast, id }]);
      start(id);
    },
    [start],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, []);

  return (
    <ToastContext value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex flex-col items-end gap-2 md:bottom-6"
      >
        {toasts.map(({ id, title, description, tone = "info" }) => {
          const Icon = ICONS[tone];
          return (
            // Hovering or focusing the message holds it (WCAG 2.2.1); leaving restarts the clock.
            <div
              key={id}
              data-toast=""
              onMouseEnter={() => {
                pause(id);
              }}
              onMouseLeave={() => {
                start(id);
              }}
              onFocus={() => {
                pause(id);
              }}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) start(id);
              }}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border border-border bg-surface p-4 shadow-card-hover"
            >
              <Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", ACCENTS[tone])} />
              <div className="flex-1">
                <p className="font-semibold text-ink">{title}</p>
                {description && <p className="text-small text-muted">{description}</p>}
              </div>
              <button
                type="button"
                onClick={() => {
                  dismiss(id);
                }}
                aria-label="Dismiss"
                className="-m-1 rounded-control p-1 text-muted hover:text-ink"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext>
  );
}

/** Returns `toast({ title, description?, tone? })`. Needs a `ToastProvider` above it. */
export function useToast() {
  const show = use(ToastContext);
  if (!show) throw new Error("useToast needs a ToastProvider");
  return show;
}
