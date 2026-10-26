import { Router, type Request } from "express";
import {
  ForgotPasswordSchema,
  ResetPasswordSchema,
  SigninSchema,
  SignupSchema,
  VerifyEmailSchema,
} from "@pitchperfect/shared";
import { requireAuth, requireSignedOut } from "../../middleware/auth.js";
import type { Csrf } from "../../middleware/csrf.js";
import { byIp, byUser, rateLimit } from "../../middleware/rate-limit.js";
import { validate } from "../../middleware/validate.js";
import { authHandlers } from "./handlers.js";
import type { AuthDeps } from "./service.js";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
/** Failed sign-ins are counted over 15 minutes; a blocked client waits out the window. */
const SIGNIN_FAILURE_WINDOW_MS = 15 * MINUTE_MS;

/**
 * The email in the (not yet validated) body, normalized like the schemas do. Limiters run before
 * validation so malformed attempts count too. The store hashes keys, so emails are never stored.
 */
function emailKey(req: Request): string {
  const body: unknown = req.body;
  if (typeof body !== "object" || body === null || !("email" in body)) return "";
  return typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
}

const byIpAndEmail = (req: Request) => `${byIp(req)}|${emailKey(req)}`;

export interface AuthRouteDeps extends AuthDeps {
  csrf: Pick<Csrf, "issueCsrfToken">;
}

/** `/api/auth/*` per docs/api.md. Limiters are created once here, not per request. */
export function authRoutes({ csrf, ...deps }: AuthRouteDeps): Router {
  const handle = authHandlers(deps, csrf);
  // The 5-per-minute window is also the backoff: a blocked client waits out the window.
  const signinLimit = rateLimit("signin", { windowMs: MINUTE_MS, limit: 5, key: byIpAndEmail });
  // Credential stuffing tries many emails from one address: cap its failures across all emails.
  // Successful sign-ins don't count, so a campus or office behind one address isn't blocked.
  const signinIpFailures = rateLimit("signin-ip-failures", {
    windowMs: SIGNIN_FAILURE_WINDOW_MS,
    limit: 30,
    key: byIp,
    failedOnly: true,
  });
  // Guessing one account's password from many addresses: cap that email's failures across all
  // addresses. It slows the email down for at most the window and never locks the account, so
  // someone hammering an address can delay its owner by minutes, not shut them out (docs/limits.md).
  // Unknown emails are counted the same way, so the answer says nothing about which exist.
  const signinEmailFailures = rateLimit("signin-email-failures", {
    windowMs: SIGNIN_FAILURE_WINDOW_MS,
    limit: 10,
    key: emailKey,
    failedOnly: true,
  });
  const signupLimit = rateLimit("signup", { windowMs: HOUR_MS, limit: 3, key: byIp });
  const resendLimit = rateLimit("resend-verification", {
    windowMs: HOUR_MS,
    limit: 3,
    key: byUser,
  });
  const forgotLimit = rateLimit("forgot-password", { windowMs: HOUR_MS, limit: 3, key: emailKey });
  // Tokens are 256-bit, so these only cap load from public, unauthenticated routes.
  const verifyLimit = rateLimit("verify-email", { windowMs: HOUR_MS, limit: 20, key: byIp });
  const resetLimit = rateLimit("reset-password", { windowMs: HOUR_MS, limit: 20, key: byIp });

  const router = Router();
  router.get("/auth/csrf", handle.csrfToken);
  router.post(
    "/auth/signup",
    requireSignedOut,
    signupLimit,
    validate({ body: SignupSchema }),
    handle.signup,
  );
  router.post(
    "/auth/verify-email",
    verifyLimit,
    validate({ body: VerifyEmailSchema }),
    handle.verify,
  );
  router.post("/auth/resend-verification", requireAuth, resendLimit, handle.resend);
  router.post(
    "/auth/signin",
    signinLimit,
    signinIpFailures,
    signinEmailFailures,
    validate({ body: SigninSchema }),
    handle.signin,
  );
  router.post("/auth/signout", handle.signout);
  router.get("/auth/me", requireAuth, handle.me);
  router.post(
    "/auth/forgot-password",
    forgotLimit,
    validate({ body: ForgotPasswordSchema }),
    handle.forgotPassword,
  );
  router.post(
    "/auth/reset-password",
    resetLimit,
    validate({ body: ResetPasswordSchema }),
    handle.reset,
  );
  return router;
}
