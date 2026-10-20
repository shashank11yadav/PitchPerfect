import type { Role } from "@pitchperfect/shared";

const HOMES = { student: "/app", employer: "/employer" } as const satisfies Record<Role, string>;

/** Where each role lands after signing in: its own dashboard. */
export function roleHome(role: Role): (typeof HOMES)[Role] {
  return HOMES[role];
}

const MAX_NEXT_LENGTH = 2048;
/** An origin that can never be real, so any value that leaves it is caught. */
const BASE = "https://pitchperfect.invalid";
// Control characters (incl. tab and newline) and backslashes, which browsers treat as slashes.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f\\]/;
/** Encoded slashes and backslashes, which could become separators after another decode. */
const ENCODED_SEPARATOR = /%(2f|5c)/i;

const within = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * The `next` parameter after sign-in, if it's safe: a same-origin path in the role's own area
 * (`/app` for students, `/employer` for employers) or a job page. Anything else (another origin,
 * a scheme, backslashes, control characters, encoded separators, dot segments that climb out of
 * the area) goes to the role's home.
 */
export function safeNext(value: string | null | undefined, role: Role): string {
  const home = roleHome(role);
  if (!value || value.length > MAX_NEXT_LENGTH) return home;
  if (!value.startsWith("/") || value.startsWith("//")) return home;
  if (UNSAFE_CHARS.test(value) || ENCODED_SEPARATOR.test(value)) return home;

  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return home;
  }
  if (url.origin !== BASE) return home;

  // `URL` has resolved any dot segments, encoded or not, so the checks see the real path.
  const { pathname } = url;
  const allowed = within(pathname, home) || /^\/jobs\/[^/]+$/.test(pathname);
  return allowed ? `${pathname}${url.search}${url.hash}` : home;
}
