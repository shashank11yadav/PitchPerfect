import mongoose, { type Types } from "mongoose";
import { LIMITS, type ChangeEmail } from "@pitchperfect/shared";
import { AuthToken, Company, EmailChange, User } from "../../db/models/index.js";
import { UnauthenticatedError, ValidationError } from "../../errors.js";
import * as emails from "../../services/email-templates.js";
import { sendSafely, type MailFailureLog } from "../../services/mailer.js";
import { hashToken, invalidTokenError, newLinkToken } from "../../services/tokens.js";
import { appLink, isDuplicateKey, verifyOwnedCompany, type AuthDeps } from "../auth/service.js";
import { upsertRow } from "../practice/quota.js";
import { requireCurrentPassword } from "./credentials.js";

const CHANGE_TTL_MS = LIMITS.verifyTokenHours * 60 * 60 * 1000;

/** Tells the owner of `email` that another account asked to move to it; nothing was changed. */
function noticeToExistingAccount(deps: AuthDeps, log: MailFailureLog, email: string): void {
  const content = emails.emailChangeToExistingAccount(
    appLink(deps.config, "/signin"),
    appLink(deps.config, "/forgot-password"),
  );
  void sendSafely(deps.mailer, { to: email, ...content }, log, "change_email_existing");
}

/**
 * `POST /api/me/change-email`. Checks the password, records the change as pending and answers,
 * whether or not the new address has an account: the account keeps its email until the link is
 * followed, so the answer and `/api/auth/me` (the old email, and the new one as `pendingEmail`)
 * are the same either way. A newer request replaces the pending one and its link. After the
 * answer, a free address gets the link and an address in use gets a notice instead.
 */
export async function requestEmailChange(
  deps: AuthDeps,
  log: MailFailureLog,
  userId: string,
  input: ChangeEmail,
): Promise<void> {
  await requireCurrentPassword(userId, input.currentPassword);
  const user = await User.findById(userId).select("email").lean();
  if (!user) throw new UnauthenticatedError();
  if (user.email === input.newEmail) {
    throw new ValidationError({ newEmail: "That’s already the email on your account" });
  }

  const { raw, tokenHash } = newLinkToken();
  const pending = {
    $set: { newEmail: input.newEmail, tokenHash, expiresAt: new Date(Date.now() + CHANGE_TTL_MS) },
  };
  await upsertRow(
    (options) => EmailChange.updateOne({ userId: user._id }, pending, options),
    "userId",
  );

  if (await User.exists({ email: input.newEmail })) {
    noticeToExistingAccount(deps, log, input.newEmail);
    return;
  }
  const content = emails.confirmEmailChange(appLink(deps.config, "/verify-email", raw));
  void sendSafely(deps.mailer, { to: input.newEmail, ...content }, log, "change_email");
}

/** Drops the badge of the employer's verified company; confirming the new address may restore it. */
async function dropCompanyBadge(ownerId: Types.ObjectId): Promise<void> {
  await Company.updateOne(
    { ownerId, verification: "verified" },
    { $set: { verification: "unverified" } },
  );
}

/**
 * Applies the email change whose link `token` is. Returns false when it isn't one (it may be a
 * sign-up verification link, which `POST /api/auth/verify-email` also takes). The new address must
 * still be free: if it has an account by now, the change is dropped, that address gets the notice
 * a taken address gets, and the link answers like an expired one. Following the link proves the
 * inbox, so the new address is confirmed at once, and an employer's company keeps or regains the
 * badge only if it matches (`verifyOwnedCompany`). Links sent to the old address stop working, and
 * the old address is told.
 */
export async function confirmEmailChange(
  deps: AuthDeps,
  log: MailFailureLog,
  token: string,
): Promise<boolean> {
  const change = await EmailChange.findOne({
    tokenHash: hashToken(token),
    expiresAt: mongoose.trusted({ $gt: new Date() }),
  }).lean();
  if (!change) return false;
  const { newEmail } = change;
  const user = await User.findById(change.userId).select("email role").lean();
  const drop = async () => {
    await EmailChange.deleteOne({ _id: change._id });
    return invalidTokenError();
  };
  if (!user) throw await drop();
  if (await User.exists({ email: newEmail })) {
    noticeToExistingAccount(deps, log, newEmail);
    throw await drop();
  }

  const userId = user._id.toString();
  if (user.role === "employer") await dropCompanyBadge(user._id);
  try {
    const moved = await User.updateOne(
      { _id: user._id, email: user.email },
      { $set: { email: newEmail, emailVerifiedAt: new Date() } },
    );
    if (moved.matchedCount === 0) throw await drop();
  } catch (error) {
    if (!isDuplicateKey(error, "email")) throw error;
    // Someone took the address a moment ago: the account stays as it was.
    if (user.role === "employer") await verifyOwnedCompany(userId, user.email);
    noticeToExistingAccount(deps, log, newEmail);
    throw await drop();
  }

  await Promise.all([
    EmailChange.deleteOne({ _id: change._id }),
    AuthToken.deleteMany({ userId: user._id, usedAt: null }),
  ]);
  if (user.role === "employer") await verifyOwnedCompany(userId, newEmail);
  void sendSafely(deps.mailer, { to: user.email, ...emails.emailChanged() }, log, "email_changed");
  return true;
}
