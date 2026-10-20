"use client";

import {
  BookOpen,
  Briefcase,
  Building2,
  FileText,
  History,
  LayoutDashboard,
  Menu,
  Mic,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { NavIcon, NavLink } from "@/lib/site";
import { Logo } from "./Logo";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  learn: BookOpen,
  practice: Mic,
  history: History,
  jobs: Briefcase,
  applications: FileText,
  company: Building2,
  settings: Settings,
};

const MAX_TABS = 5;
const TAB_COLUMNS = ["", "grid-cols-1", "grid-cols-2", "grid-cols-3", "grid-cols-4", "grid-cols-5"];

interface AppShellProps {
  /** The role's links, e.g. `STUDENT_NAV`; those marked `tab` form the mobile tab bar. */
  links: readonly NavLink[];
  /** The page title, rendered as the page's only `h1`. */
  title: string;
  /** The account menu in the top bar. */
  account?: ReactNode;
  children: ReactNode;
}

/** The signed-in layout: sidebar on desktop; top bar, menu and bottom tab bar on phones. */
export function AppShell({ links, title, account, children }: AppShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  // The dashboard link ("/app") is a prefix of every other link, so the longest match wins.
  const current = links
    .filter(({ href }) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const tabs = links.filter((link) => link.tab === true).slice(0, MAX_TABS);

  const item = (link: NavLink, variant: "side" | "tab") => {
    const Icon = link.icon ? ICONS[link.icon] : undefined;
    return (
      <li key={link.href}>
        <Link
          href={link.href}
          aria-current={link.href === current ? "page" : undefined}
          onClick={() => {
            setMenuOpen(false);
          }}
          className={cn(
            "flex items-center rounded-control font-semibold text-muted hover:bg-primary-soft hover:text-ink",
            "aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary",
            variant === "side"
              ? "gap-3 px-3 py-2.5"
              : "min-h-14 flex-col justify-center gap-1 px-1 text-caption",
          )}
        >
          {Icon && <Icon aria-hidden="true" className="size-5 shrink-0" />}
          <span>{link.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
      <aside className="hidden border-r border-border bg-surface md:flex md:flex-col md:gap-8 md:p-6">
        <Link href={links[0]?.href ?? "/"} className="rounded-control">
          <Logo />
        </Link>
        <nav aria-label="App">
          <ul className="flex flex-col gap-1">{links.map((link) => item(link, "side"))}</ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface px-4 md:px-8">
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="app-menu"
            onClick={() => {
              setMenuOpen((open) => !open);
            }}
            className="-ml-2 rounded-control p-2 text-ink md:hidden"
          >
            {menuOpen ? (
              <X aria-hidden="true" className="size-6" />
            ) : (
              <Menu aria-hidden="true" className="size-6" />
            )}
            <span className="sr-only">Menu</span>
          </button>
          <h1 className="min-w-0 flex-1 truncate text-h4">{title}</h1>
          {account}
        </header>
        <nav
          id="app-menu"
          aria-label="App"
          hidden={!menuOpen}
          className="border-b border-border bg-surface p-3 md:hidden"
        >
          <ul className="flex flex-col gap-1">{links.map((link) => item(link, "side"))}</ul>
        </nav>
        <main id="main" className="flex-1 p-4 pb-24 md:p-8">
          {children}
        </main>
      </div>

      <nav
        aria-label="Tabs"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface md:hidden"
      >
        <ul className={cn("grid", TAB_COLUMNS[tabs.length])}>
          {tabs.map((link) => item(link, "tab"))}
        </ul>
      </nav>
    </div>
  );
}
