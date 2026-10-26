export const SITE_NAME = "PitchPerfect";
export const TAGLINE = "Practice your pitch. Get hired.";

export const REPO_URL = "https://github.com/shashank11yadav/PitchPerfect";

/** Where bug reports and questions about the code go. */
export const ISSUES_URL = `${REPO_URL}/issues`;

/** Who built PitchPerfect: named in the footer and on the about page, and the legal contact. */
export const AUTHOR = {
  name: "Shashank Yadav",
  github: "https://github.com/shashank11yadav",
  website: "https://www.shashankyadav.dev/",
} as const;

/** The api's session cookie. The web app only checks that it exists; it can't read it. */
export const SESSION_COOKIE = "pp.sid";

/** Canonical origin for metadata, sitemaps and JSON-LD. Read on the server only. */
export const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** Icon names `AppShell` knows how to draw; links stay plain data so server code can pass them. */
export type NavIcon =
  "dashboard" | "learn" | "practice" | "history" | "jobs" | "applications" | "company";

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

/** Settings lives in the account menu (`RoleShell`), not here. */
export const STUDENT_NAV: readonly NavLink[] = [
  { href: "/app", label: "Dashboard", icon: "dashboard", tab: true },
  { href: "/app/learn", label: "Learn", icon: "learn", tab: true },
  { href: "/app/practice", label: "Practice", icon: "practice", tab: true },
  // Not a tab: phones reach it from the practice pages and the menu.
  { href: "/app/history", label: "History", icon: "history" },
  { href: "/app/jobs", label: "Jobs", icon: "jobs", tab: true },
  { href: "/app/applications", label: "Applications", icon: "applications", tab: true },
];

/** Settings lives in the account menu, as for students. */
export const EMPLOYER_NAV: readonly NavLink[] = [
  { href: "/employer", label: "Dashboard", icon: "dashboard", tab: true },
  { href: "/employer/jobs", label: "Jobs", icon: "jobs", tab: true },
  { href: "/employer/company", label: "Company", icon: "company", tab: true },
];

export const LEGAL_NAV: readonly NavLink[] = [
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];
