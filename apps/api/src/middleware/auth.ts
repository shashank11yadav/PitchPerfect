import type { Request, RequestHandler, Response } from "express";
import mongoose from "mongoose";
import type { Role } from "@pitchperfect/shared";
import { User } from "../db/models/index.js";
import { ForbiddenError, UnauthenticatedError } from "../errors.js";
import { destroySession, sessionUserId } from "./session.js";

/** The signed-in user as guards see it. Never includes the password hash. */
interface SessionUser {
  id: string;
  role: Role;
  emailVerifiedAt: Date | null;
  practiceConsentAt: Date | null;
}

/** The user `requireAuth` (or any guard) loaded for this request. */
export function userOf(res: Response): SessionUser {
  const user = res.locals.user as SessionUser | undefined;
  if (!user) throw new UnauthenticatedError();
  return user;
}

/**
 * Loads the signed-in user once per request (cached on `res.locals.user`). Returns null when there
 * is no session. A session whose user no longer exists is destroyed.
 */
export async function loadUser(req: Request, res: Response): Promise<SessionUser | null> {
  const cached = res.locals.user as SessionUser | undefined;
  if (cached) return cached;

  const userId = sessionUserId(req);
  if (userId === undefined) return null;
  const doc = mongoose.isValidObjectId(userId)
    ? await User.findById(userId).select("role emailVerifiedAt practiceConsentAt").lean()
    : null;
  if (!doc) {
    await destroySession(req, res);
    return null;
  }
  const user: SessionUser = {
    id: doc._id.toString(),
    role: doc.role,
    emailVerifiedAt: doc.emailVerifiedAt ?? null,
    practiceConsentAt: doc.practiceConsentAt ?? null,
  };
  res.locals.user = user;
  return user;
}

async function requireUser(req: Request, res: Response): Promise<SessionUser> {
  const user = await loadUser(req, res);
  if (!user) throw new UnauthenticatedError();
  return user;
}

/** A guard that signs the user in (401 if not) and then runs `check`, which throws to refuse. */
function guard(check: (user: SessionUser) => void): RequestHandler {
  return async (req, res, next) => {
    check(await requireUser(req, res));
    next();
  };
}

export const requireAuth: RequestHandler = guard(() => undefined);

export const requireRole = (role: Role): RequestHandler =>
  guard((user) => {
    if (user.role !== role) throw new ForbiddenError("forbidden");
  });

export const requireVerified: RequestHandler = guard((user) => {
  if (!user.emailVerifiedAt)
    throw new ForbiddenError("email_not_verified", "Verify your email to continue");
});

/** Students only: they must have accepted the practice notice. */
export const requireConsent: RequestHandler = guard((user) => {
  if (user.role !== "student") throw new ForbiddenError("forbidden");
  if (!user.practiceConsentAt) {
    throw new ForbiddenError("consent_required", "Accept the practice notice to continue");
  }
});
