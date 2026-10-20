"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { roleHome } from "@/lib/redirects";
import { useSession } from "@/lib/session";
import { PUBLIC_NAV, type NavLink } from "@/lib/site";
import { Logo } from "./Logo";

const isActive = (pathname: string | null, href: string) =>
  pathname === href || pathname?.startsWith(`${href}/`) === true;

interface SessionActionsProps {
  /** `bar`: the desktop pair. `menu`: two equal buttons in the mobile menu. */
  variant: "bar" | "menu";
  onNavigate: () => void;
}

/**
 * Sign in / Sign up for visitors, Dashboard / Sign out once signed in. Visitors without a session
 * cookie get their links in the server HTML. With a cookie, the space stays reserved (same
 * width, nothing to click) until `/auth/me` answers, so the bar never jumps or flashes the
 * wrong pair.
 */
function SessionActions({ variant, onNavigate }: SessionActionsProps) {
  const { status, user, signOut } = useSession();
  const [leaving, setLeaving] = useState(false);
  const menu = variant === "menu";
  const quiet = buttonClasses({
    variant: menu ? "secondary" : "ghost",
    className: cn(menu && "flex-1"),
  });
  const loud = buttonClasses({ className: cn(menu && "flex-1") });

  let actions;
  if (status === "signed_in" && user) {
    actions = (
      <>
        <button
          type="button"
          disabled={leaving}
          aria-busy={leaving || undefined}
          onClick={() => {
            setLeaving(true);
            onNavigate();
            void signOut().finally(() => {
              setLeaving(false);
            });
          }}
          className={quiet}
        >
          Sign out
        </button>
        <Link href={roleHome(user.role)} onClick={onNavigate} className={loud}>
          Dashboard
        </Link>
      </>
    );
  } else if (status === "signed_out") {
    actions = (
      <>
        <Link href="/signin" onClick={onNavigate} className={quiet}>
          Sign in
        </Link>
        <Link href="/signup" onClick={onNavigate} className={loud}>
          Sign up
        </Link>
      </>
    );
  }

  return (
    <div
      data-session-actions
      aria-busy={status === "loading" || undefined}
      className={cn(
        "flex items-center gap-3",
        menu ? "px-4 pb-4" : "hidden w-56 shrink-0 justify-end md:flex",
        // The loading state still needs the height of a button row.
        status === "loading" && "min-h-11",
      )}
    >
      {actions}
    </div>
  );
}

interface NavbarProps {
  links?: readonly NavLink[];
}

/** The public site's sticky top bar: wordmark, four links and the session's two actions, on white. */
export function Navbar({ links = PUBLIC_NAV }: NavbarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // While the mobile menu is open, focus starts in it and Escape closes it, returning focus.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector("a")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
  };

  const linkList = (className: string) =>
    links.map(({ href, label }) => (
      <li key={href}>
        <Link
          href={href}
          aria-current={isActive(pathname, href) ? "page" : undefined}
          onClick={close}
          className={cn(
            "rounded-control font-semibold text-ink hover:text-primary aria-[current=page]:text-primary",
            className,
          )}
        >
          {label}
        </Link>
      </li>
    ));

  return (
    <header className="sticky top-0 z-40 bg-surface">
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-wide items-center justify-between gap-4 px-4 sm:px-6 lg:gap-6 lg:px-8"
      >
        <Link href="/" className="shrink-0 rounded-control">
          <Logo />
        </Link>
        <ul className="hidden items-center gap-4 md:flex lg:gap-6">{linkList("px-1 py-2")}</ul>
        <SessionActions variant="bar" onNavigate={close} />
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => {
            setOpen((value) => !value);
          }}
          className="-mr-2 rounded-control p-2 text-ink md:hidden"
        >
          {open ? (
            <X aria-hidden="true" className="size-6" />
          ) : (
            <Menu aria-hidden="true" className="size-6" />
          )}
          <span className="sr-only">Menu</span>
        </button>
      </nav>
      <div
        ref={menuRef}
        id="mobile-nav"
        hidden={!open}
        className="bg-surface shadow-float md:hidden"
      >
        <ul className="flex flex-col gap-1 px-4 py-3">{linkList("block px-2 py-3")}</ul>
        <SessionActions variant="menu" onNavigate={close} />
      </div>
    </header>
  );
}
