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
import { byIp, rateLimit } from "../../middleware/rate-limit.js";
import { sessionUserId } from "../../middleware/session.js";
import { validate } from "../../middleware/validate.js";
import { authHandlers } from "./handlers.js";
import type { AuthDeps } from "./service.js";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

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
const byUser = (req: Request) => sessionUserId(req) ?? byIp(req);

export interface AuthRouteDeps extends AuthDeps {
  csrf: Pick<Csrf, "issueCsrfToken">;
}

/** `/api/auth/*` per docs/api.md. Limiters are created once here, not per request. */
export function authRoutes({ csrf, ...deps }: AuthRouteDeps): Router {
  const handle = authHandlers(deps, csrf);
  // The 5-per-minute window is also the backoff: a blocked client waits out the window.
  const signinLimit = rateLimit("signin", { windowMs: MINUTE_MS, limit: 5, key: byIpAndEmail });
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
  router.post("/auth/signin", signinLimit, validate({ body: SigninSchema }), handle.signin);
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
