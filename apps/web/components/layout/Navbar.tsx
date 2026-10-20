"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { PUBLIC_NAV, type NavLink } from "@/lib/site";
import { Logo } from "./Logo";

const isActive = (pathname: string | null, href: string) =>
  pathname === href || pathname?.startsWith(`${href}/`) === true;

interface NavbarProps {
  links?: readonly NavLink[];
}

/** The public site's sticky, translucent top navigation. */
export function Navbar({ links = PUBLIC_NAV }: NavbarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const linkList = (className: string) =>
    links.map(({ href, label }) => (
      <li key={href}>
        <Link
          href={href}
          aria-current={isActive(pathname, href) ? "page" : undefined}
          onClick={() => {
            setOpen(false);
          }}
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
    <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur">
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-content items-center justify-between gap-6 px-4 sm:px-6"
      >
        <Link href="/" className="shrink-0 rounded-control">
          <Logo />
        </Link>
        <ul className="hidden items-center gap-6 md:flex">{linkList("px-1 py-2")}</ul>
        <div className="hidden items-center gap-3 md:flex">
          <Link href="/signin" className={buttonClasses({ variant: "ghost" })}>
            Sign in
          </Link>
          <Link href="/signup" className={buttonClasses()}>
            Get started
          </Link>
        </div>
        <button
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
      <div id="mobile-nav" hidden={!open} className="border-t border-border bg-surface md:hidden">
        <ul className="flex flex-col gap-1 px-4 py-3">{linkList("block px-2 py-3")}</ul>
        <div className="flex gap-3 px-4 pb-4">
          <Link
            href="/signin"
            className={buttonClasses({ variant: "secondary", className: "flex-1" })}
          >
            Sign in
          </Link>
          <Link href="/signup" className={buttonClasses({ className: "flex-1" })}>
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
