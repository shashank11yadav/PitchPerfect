"use client";

import { ChevronDown, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";

const ITEM =
  "flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left font-semibold text-ink hover:bg-primary-soft";

/** The top bar's account button: who is signed in, Settings, and Sign out. */
export function AccountMenu({ settingsHref }: { settingsHref: string }) {
  const { user, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  if (!user) return null;
  const close = () => {
    setOpen(false);
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((shown) => !shown);
        }}
        className="flex items-center gap-2 rounded-pill py-1.5 pr-2 pl-1.5 font-semibold text-ink hover:bg-surface-2"
      >
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-pill bg-primary-soft text-small text-primary"
        >
          {user.firstName.charAt(0)}
          {user.lastName.charAt(0)}
        </span>
        <span className="hidden sm:inline">{user.firstName}</span>
        <span className="sr-only">account menu</span>
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 text-muted transition-transform", open && "rotate-180")}
        />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute right-0 z-40 mt-2 w-72 rounded-card border border-border bg-surface p-2 shadow-card-hover"
      >
        <p className="border-b border-border px-3 pt-2 pb-3 text-small">
          <span className="block font-semibold text-ink">
            {user.firstName} {user.lastName}
          </span>
          <span className="block truncate text-muted">{user.email}</span>
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          <li>
            <Link href={settingsHref} onClick={close} className={ITEM}>
              <Settings aria-hidden="true" className="size-5 text-muted" />
              Settings
            </Link>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                close();
                void signOut();
              }}
              className={ITEM}
            >
              <LogOut aria-hidden="true" className="size-5 text-muted" />
              Sign out
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
