import type { ChangePassword } from "@pitchperfect/shared";
import { AuthToken, User } from "../../db/models/index.js";
import { InvalidCredentialsError, UnauthenticatedError } from "../../errors.js";
import type { SessionIdentity } from "../../middleware/session.js";
import { hashPassword, verifyPassword } from "../../services/passwords.js";
import { assertPasswordAllowed, type AuthDeps } from "../auth/service.js";

/**
 * Re-checks the signed-in user's password before a sensitive change. Wrong passwords are a 401
 * `invalid_credentials`, the same answer as at sign-in. Returns the user's stored details.
 */
export async function requireCurrentPassword(userId: string, currentPassword: string) {
  const user = await User.findById(userId).select("+passwordHash").lean();
  if (!user) throw new UnauthenticatedError();
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new InvalidCredentialsError();
  }
  return user;
}

/** Reset links issued before a credential change must not outlive it. */
const dropResetTokens = (userId: string) =>
  AuthToken.deleteMany({ userId, type: "reset_password", usedAt: null });

/**
 * Sets the new password and ends every session in one update (the version bump); the caller
 * re-issues the current session from the returned identity so only this one survives.
 */
export async function changePassword(
  deps: AuthDeps,
  userId: string,
  { currentPassword, newPassword }: ChangePassword,
): Promise<SessionIdentity> {
  const user = await requireCurrentPassword(userId, currentPassword);
  await assertPasswordAllowed(deps.config, newPassword, user.email, "newPassword");
  const passwordHash = await hashPassword(newPassword);

  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: { passwordHash }, $inc: { sessionVersion: 1 } },
    { returnDocument: "after", projection: { sessionVersion: 1 } },
  ).lean();
  if (!updated) throw new UnauthenticatedError();
  await dropResetTokens(userId);
  return { userId, role: user.role, sessionVersion: updated.sessionVersion ?? 0 };
}
