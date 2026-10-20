"use client";

import type { AuthMe, PublicUser, Role } from "@pitchperfect/shared";
import { useRouter } from "next/navigation";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, apiFetch, resetCsrf, type Parser } from "./api";
import { roleHome, safeNext } from "./redirects";

type SessionStatus = "loading" | "signed_in" | "signed_out";

export interface Session {
  status: SessionStatus;
  user?: PublicUser;
  profile?: AuthMe["profile"];
  company?: AuthMe["company"];
  /** Asks the api who is signed in. Call it after anything that changes the session. */
  refresh: () => Promise<void>;
  /** Signs out, forgets the CSRF token, refreshes, and goes to the home page. */
  signOut: () => Promise<void>;
  /**
   * True from `signOut` until someone signs in again, so a page guard that sees the session end
   * lets the user go home instead of sending them to sign in.
   */
  leaving: boolean;
}

type Snapshot = Pick<Session, "status" | "user" | "profile" | "company"> & { leaving?: boolean };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** `GET /api/auth/me`. There is no shared zod schema for it, so the shape is checked here. */
const AuthMeParser: Parser<AuthMe> = {
  parse(data) {
    if (
      isObject(data) &&
      isObject(data.user) &&
      (data.user.role === "student" || data.user.role === "employer") &&
      typeof data.user.email === "string" &&
      isObject(data.profile)
    ) {
      return data as unknown as AuthMe;
    }
    throw new ApiError(502, "internal_error", "Unexpected /auth/me response");
  },
};

const noop = () => Promise.resolve();

/** Without a provider (isolated component tests), everyone is signed out. */
const SessionContext = createContext<Session>({
  status: "signed_out",
  refresh: noop,
  signOut: noop,
  leaving: false,
});

interface SessionProviderProps {
  /**
   * `signed_out` when the server saw no session cookie: nothing to ask, so signed-out visitors
   * never wait or see a placeholder. `loading` when there is a cookie that may still be valid.
   */
  initialStatus: "loading" | "signed_out";
  children: ReactNode;
}

/** Who is signed in, from `GET /api/auth/me`, for every page under the root layout. */
export function SessionProvider({ initialStatus, children }: SessionProviderProps) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<Snapshot>({ status: initialStatus });
  /** Only the newest request may set state, so a slow older answer can't win. */
  const latest = useRef(0);

  /** Asks the api; `leaving` marks a signed-out answer as the end of a deliberate sign-out. */
  const load = useCallback(async (leaving: boolean) => {
    const request = ++latest.current;
    let next: Snapshot;
    try {
      const me = await apiFetch("/auth/me", { schema: AuthMeParser });
      next = { status: "signed_in", user: me.user, profile: me.profile, company: me.company };
    } catch {
      // 401 is the ordinary signed-out answer. An outage also shows the signed-out links; the
      // api still guards every signed-in route.
      next = { status: "signed_out", leaving };
    }
    if (request === latest.current) setSnapshot(next);
  }, []);

  const refresh = useCallback(() => load(false), [load]);

  const signOut = useCallback(async () => {
    try {
      await apiFetch("/auth/signout", { method: "POST" });
    } catch {
      // The refresh below shows whether the session really ended.
    }
    // The session ID changed, and the CSRF token was bound to the old one.
    resetCsrf();
    await load(true);
    router.push("/");
  }, [load, router]);

  useEffect(() => {
    if (initialStatus === "loading") void refresh();
  }, [initialStatus, refresh]);

  const value = useMemo(
    () => ({ ...snapshot, leaving: snapshot.leaving === true, refresh, signOut }),
    [snapshot, refresh, signOut],
  );
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): Session {
  return use(SessionContext);
}

function Checking({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-10 text-muted">
      <Spinner />
      {label}
    </div>
  );
}

interface RequireRoleProps {
  role: Role;
  children: ReactNode;
}

/**
 * Client-side gate for signed-in pages: unauthenticated visitors go to sign in (and come back
 * here after), and the other role goes to its own home. Only UX: the api is the real gate.
 */
export function RequireRole({ role, children }: RequireRoleProps) {
  const { status, user, leaving } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "signed_out" && !leaving) {
      const here = `${window.location.pathname}${window.location.search}`;
      router.replace(`/signin?next=${encodeURIComponent(here)}`);
    } else if (status === "signed_in" && user && user.role !== role) {
      router.replace(roleHome(user.role));
    }
  }, [status, user, role, router, leaving]);

  if (status === "signed_in" && user?.role === role) return children;
  return <Checking label={leaving ? "Signing you out" : "Loading your account"} />;
}

interface SignedOutOnlyProps {
  /** Where to go once signed in (checked with `safeNext`); the role's home without it. */
  next?: string | undefined;
  children: ReactNode;
}

/**
 * For sign-in and sign-up. Someone already signed in goes on to `next` or their home, and so does
 * someone who signs in here: the form only refreshes the session, and this is the one place that
 * navigates, so two redirects can't race.
 */
export function SignedOutOnly({ next, children }: SignedOutOnlyProps) {
  const { status, user } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "signed_in" && user) router.replace(safeNext(next, user.role));
  }, [status, user, next, router]);

  if (status === "signed_out") return children;
  return (
    <Checking
      label={
        status === "loading" ? "Checking whether you're signed in" : "Taking you to your account"
      }
    />
  );
}
