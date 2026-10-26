import { randomBytes } from "node:crypto";
import type { CookieOptions, Request, RequestHandler, Response } from "express";
import { doubleCsrf } from "csrf-csrf";
import { DAY_MS, LIMITS } from "@pitchperfect/shared";
import type { Config } from "../config.js";
import { ForbiddenError } from "../errors.js";
import { sessionUserId } from "./session.js";

const CSRF_COOKIE = "pp.csrf";
/** Identifies an anonymous browser; the CSRF token is bound to it until there is a session. */
const ANONYMOUS_ID_COOKIE = "pp.aid";

const ANONYMOUS_ID_PATTERN = /^[0-9a-f]{64}$/;

function anonymousIdOf(req: Request): string | undefined {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[
    ANONYMOUS_ID_COOKIE
  ];
  return typeof value === "string" && ANONYMOUS_ID_PATTERN.test(value) ? value : undefined;
}

export interface Csrf {
  /** Double-submit check on every method except GET, HEAD and OPTIONS. */
  csrfProtection: RequestHandler;
  /** Returns the token for this browser and sets the paired `pp.csrf` cookie. */
  issueCsrfToken: (req: Request, res: Response) => string;
}

/**
 * Double-submit CSRF protection (header `x-csrf-token`, cookie `pp.csrf`). The token is bound to the
 * session id once signed in. Before that it is bound to the `pp.aid` cookie, because with
 * `saveUninitialized: false` an anonymous visitor has no stable session id.
 */
export function createCsrf(config: Config): Csrf {
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    path: "/",
  };

  const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
    getSecret: () => config.CSRF_SECRET,
    getSessionIdentifier: (req) => {
      if (sessionUserId(req) !== undefined) return `session:${req.sessionID}`;
      // Without a browser id there is nothing to bind to: a one-off random id makes every token
      // fail, instead of all such browsers sharing one identifier.
      return `anonymous:${anonymousIdOf(req) ?? randomBytes(32).toString("hex")}`;
    },
    cookieName: CSRF_COOKIE,
    cookieOptions,
  });

  const csrfProtection: RequestHandler = (req, res, next) => {
    doubleCsrfProtection(req, res, (error?: unknown) => {
      next(
        error ? new ForbiddenError("csrf_failed", "Your request couldn't be verified") : undefined,
      );
    });
  };

  const issueCsrfToken = (req: Request, res: Response): string => {
    if (sessionUserId(req) === undefined && anonymousIdOf(req) === undefined) {
      const id = randomBytes(32).toString("hex");
      res.cookie(ANONYMOUS_ID_COOKIE, id, {
        ...cookieOptions,
        maxAge: LIMITS.sessionAbsoluteDays * DAY_MS,
      });
      // So this request's own token is bound to the id it just set.
      (req.cookies as Record<string, unknown>)[ANONYMOUS_ID_COOKIE] = id;
    }
    return generateCsrfToken(req, res);
  };

  return { csrfProtection, issueCsrfToken };
}
