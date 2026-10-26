import type { ChangeEmail, ChangePassword } from "@pitchperfect/shared";
import { Company, AuthToken, User } from "../../db/models/index.js";
import {
  ConflictError,
  InvalidCredentialsError,
  UnauthenticatedError,
  ValidationError,
} from "../../errors.js";
import type { SessionIdentity } from "../../middleware/session.js";
import * as emails from "../../services/email-templates.js";
import { sendSafely, type MailFailureLog } from "../../services/mailer.js";
import { hashPassword, verifyPassword } from "../../services/passwords.js";
import {
  assertPasswordAllowed,
  isDuplicateKey,
  sendVerificationEmail,
  type AuthDeps,
} from "../auth/service.js";

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

/**
 * Moves the account to a new, unverified address and sends the verification link there. An
 * employer's verified company goes back to unverified (suspended stays suspended): confirming
 * the new address re-verifies it when the domain matches. The old address is told, so a takeover
 * is noticed. Other sessions stay signed in; the caller re-issues this one.
 */
export async function changeEmail(
  deps: AuthDeps,
  log: MailFailureLog,
  userId: string,
  { currentPassword, newEmail }: ChangeEmail,
): Promise<SessionIdentity> {
  const user = await requireCurrentPassword(userId, currentPassword);
  if (newEmail === user.email) {
    throw new ValidationError({ newEmail: "That’s already your email address" });
  }
  const taken = () => new ConflictError("email_taken", "That email is already in use");
  if (await User.exists({ email: newEmail })) throw taken();

  // The company is downgraded first, so a failure can never leave a verified company under an
  // unconfirmed address. The worst case is an unverified company, which the admin CLI can fix.
  if (user.role === "employer") {
    await Company.updateOne(
      { ownerId: userId, verification: "verified" },
      { $set: { verification: "unverified" } },
    );
  }
  try {
    await User.updateOne({ _id: userId }, { $set: { email: newEmail, emailVerifiedAt: null } });
  } catch (error) {
    // Lost a race with someone taking the address between the check and the write.
    throw isDuplicateKey(error, "email") ? taken() : error;
  }
  await dropResetTokens(userId);

  await sendVerificationEmail(deps, log, { id: userId, email: newEmail });
  await sendSafely(deps.mailer, { to: user.email, ...emails.emailChanged() }, log, "email_changed");
  return { userId, role: user.role, sessionVersion: user.sessionVersion ?? 0 };
}
