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

/** `unavailable`: the api didn't answer who this is (an outage), which isn't the same as signed out. */
export type SessionStatus = "loading" | "signed_in" | "signed_out" | "unavailable";

export interface Session {
  status: SessionStatus;
  user?: PublicUser;
  profile?: AuthMe["profile"];
  company?: AuthMe["company"];
  /** Asks the api who is signed in, and resolves to the answer. Call it after anything that changes the session. */
  refresh: () => Promise<SessionStatus>;
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

/** Without a provider (isolated component tests), everyone is signed out. */
const SessionContext = createContext<Session>({
  status: "signed_out",
  refresh: () => Promise.resolve("signed_out"),
  signOut: () => Promise.resolve(),
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
  const load = useCallback(async (leaving: boolean): Promise<SessionStatus> => {
    const request = ++latest.current;
    let next: Snapshot;
    try {
      const me = await apiFetch("/auth/me", { schema: AuthMeParser });
      next = { status: "signed_in", user: me.user, profile: me.profile, company: me.company };
    } catch (error) {
      // 401 is the ordinary signed-out answer. Anything else is an outage: public pages still
      // show the signed-out links, but signed-in pages offer a retry instead of the sign-in page.
      const signedOut = error instanceof ApiError && (error.status === 401 || error.status === 403);
      next = { status: signedOut ? "signed_out" : "unavailable", leaving };
    }
    if (request === latest.current) setSnapshot(next);
    return next.status;
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

  // A public page can come back from the back/forward cache as it was left, signed in, after the
  // session ended in another page; it asks again. A signed-out page has nothing to recheck.
  const status = useRef(snapshot.status);
  useEffect(() => {
    status.current = snapshot.status;
  });
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && status.current !== "signed_out") void refresh();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ ...snapshot, leaving: snapshot.leaving === true, refresh, signOut }),
    [snapshot, refresh, signOut],
  );
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): Session {
  return use(SessionContext);
}

/** Gives a subtree a fixed session, such as the static demo's visitor in the practice room. */
export function ProvideSession({ session, children }: { session: Session; children: ReactNode }) {
  return <SessionContext value={session}>{children}</SessionContext>;
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
  const { status, user, leaving, refresh } = useSession();
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (status === "signed_out" && !leaving) {
      const here = `${window.location.pathname}${window.location.search}`;
      router.replace(`/signin?next=${encodeURIComponent(here)}`);
    } else if (status === "signed_in" && user && user.role !== role) {
      router.replace(roleHome(user.role));
    }
  }, [status, user, role, router, leaving]);

  if (status === "signed_in" && user?.role === role) return children;
  if (status === "unavailable" && !leaving) {
    return (
      <div role="alert" className="flex flex-col items-start gap-4 py-10 text-ink">
        <p>We can’t reach your account right now. Try again in a moment.</p>
        <button
          type="button"
          disabled={retrying}
          aria-busy={retrying || undefined}
          onClick={() => {
            setRetrying(true);
            void refresh().finally(() => {
              setRetrying(false);
            });
          }}
          className="pp-link font-semibold text-primary disabled:opacity-60"
        >
          Try again
        </button>
      </div>
    );
  }
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

  // During an outage the form still shows; signing in reports the problem itself.
  if (status === "signed_out" || status === "unavailable") return children;
  return (
    <Checking
      label={
        status === "loading" ? "Checking whether you’re signed in" : "Taking you to your account"
      }
    />
  );
}
