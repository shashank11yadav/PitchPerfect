export const SITE_NAME = "PitchPerfect";
export const TAGLINE = "Practice your pitch. Get hired.";

/** Canonical origin for metadata, sitemaps and JSON-LD. Read on the server only. */
export const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** Icon names `AppShell` knows how to draw; links stay plain data so server code can pass them. */
export type NavIcon =
  "dashboard" | "learn" | "practice" | "history" | "jobs" | "applications" | "company" | "settings";

export interface NavLink {
  href: string;
  label: string;
  icon?: NavIcon;
  /** Shown in the mobile bottom tab bar (at most five per set). */
  tab?: boolean;
}

export const PUBLIC_NAV: readonly NavLink[] = [
  { href: "/students", label: "Students" },
  { href: "/employers", label: "Employers" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/jobs", label: "Jobs" },
];

export const STUDENT_NAV: readonly NavLink[] = [
  { href: "/app", label: "Dashboard", icon: "dashboard", tab: true },
  { href: "/app/learn", label: "Learn", icon: "learn", tab: true },
  { href: "/app/practice", label: "Practice", icon: "practice", tab: true },
  { href: "/app/history", label: "History", icon: "history" },
  { href: "/app/jobs", label: "Jobs", icon: "jobs", tab: true },
  { href: "/app/applications", label: "Applications", icon: "applications", tab: true },
  { href: "/app/settings", label: "Settings", icon: "settings" },
];

export const EMPLOYER_NAV: readonly NavLink[] = [
  { href: "/employer", label: "Dashboard", icon: "dashboard", tab: true },
  { href: "/employer/jobs", label: "Jobs", icon: "jobs", tab: true },
  { href: "/employer/company", label: "Company", icon: "company", tab: true },
  { href: "/employer/settings", label: "Settings", icon: "settings", tab: true },
];

export const LEGAL_NAV: readonly NavLink[] = [
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];
