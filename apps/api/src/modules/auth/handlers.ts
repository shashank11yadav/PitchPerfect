import type { RequestHandler } from "express";
import type {
  ForgotPasswordSchema,
  ResetPasswordSchema,
  SigninSchema,
  SignupSchema,
  VerifyEmailSchema,
} from "@pitchperfect/shared";
import { userOf } from "../../middleware/auth.js";
import type { Csrf } from "../../middleware/csrf.js";
import { destroySession, regenerateSession } from "../../middleware/session.js";
import { getInput } from "../../middleware/validate.js";
import {
  getMe,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  signIn,
  signUp,
  verifyEmail,
  type AuthDeps,
} from "./service.js";

const OK = { ok: true } as const;

/** Thin handlers: read validated input, call the service, respond. */
export function authHandlers(deps: AuthDeps, csrf: Pick<Csrf, "issueCsrfToken">) {
  const csrfToken: RequestHandler = (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ csrfToken: csrf.issueCsrfToken(req, res) });
  };

  const signup: RequestHandler = async (req, res) => {
    const { body } = getInput<{ body: typeof SignupSchema }>(res);
    await signUp(deps, req.log, body);
    res.status(201).json(OK);
  };

  const verify: RequestHandler = async (_req, res) => {
    const { body } = getInput<{ body: typeof VerifyEmailSchema }>(res);
    await verifyEmail(body.token);
    res.json(OK);
  };

  const resend: RequestHandler = async (req, res) => {
    await resendVerification(deps, req.log, userOf(res).id);
    res.json(OK);
  };

  const signin: RequestHandler = async (req, res) => {
    const { body } = getInput<{ body: typeof SigninSchema }>(res);
    const { user, identity } = await signIn(body);
    await regenerateSession(req, identity);
    res.json({ user });
  };

  const signout: RequestHandler = async (req, res) => {
    await destroySession(req, res);
    res.status(204).end();
  };

  const me: RequestHandler = async (_req, res) => {
    res.json(await getMe(userOf(res).id));
  };

  const forgotPassword: RequestHandler = async (req, res) => {
    const { body } = getInput<{ body: typeof ForgotPasswordSchema }>(res);
    await requestPasswordReset(deps, req.log, body.email);
    res.json(OK);
  };

  const reset: RequestHandler = async (_req, res) => {
    const { body } = getInput<{ body: typeof ResetPasswordSchema }>(res);
    await resetPassword(deps, body);
    res.json(OK);
  };

  return { csrfToken, signup, verify, resend, signin, signout, me, forgotPassword, reset };
}
