import { randomInt } from "node:crypto";
import type { Types } from "mongoose";
import {
  LIMITS,
  slugify,
  type AuthMe,
  type PublicUser,
  type ResetPassword,
  type Signin,
  type Signup,
} from "@pitchperfect/shared";
import type { Config } from "../../config.js";
import {
  toEmployerProfileView,
  toPublicCompany,
  toPublicUser,
  toStudentProfileView,
} from "../../db/mappers.js";
import {
  AuthToken,
  Company,
  EmployerProfile,
  StudentProfile,
  User,
} from "../../db/models/index.js";
import { InvalidCredentialsError, UnauthenticatedError, ValidationError } from "../../errors.js";
import type { SessionIdentity } from "../../middleware/session.js";
import { registrableDomain, verificationForCompany } from "../../services/company-verification.js";
import * as emails from "../../services/email-templates.js";
import { sendSafely, type MailFailureLog, type Mailer } from "../../services/mailer.js";
import { checkPassword, PASSWORD_PROBLEM_MESSAGES } from "../../services/password-policy.js";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "../../services/passwords.js";
import { consumeToken, createToken, invalidTokenError, peekToken } from "../../services/tokens.js";
import { restoreLedger } from "../practice/ledger-hold.js";

type CompanyInput = Extract<Signup, { role: "employer" }>["company"];

export interface AuthDeps {
  config: Config;
  mailer: Mailer;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const VERIFY_TTL_MS = LIMITS.verifyTokenHours * HOUR_MS;
const RESET_TTL_MS = LIMITS.resetTokenMinutes * MINUTE_MS;
const DUPLICATE_KEY_CODE = 11000;
const SLUG_SUFFIX_SPACE = 36 ** 6;

/** A page of the web app, always built from `APP_URL` (never the request's Host). */
export function appLink(config: Config, path: string, token?: string): string {
  const base = config.APP_URL.endsWith("/") ? config.APP_URL : `${config.APP_URL}/`;
  const url = new URL(path.replace(/^\//, ""), base);
  if (token !== undefined) url.searchParams.set("token", token);
  return url.toString();
}

export function isDuplicateKey(error: unknown, field: string): boolean {
  const { code, keyPattern } = (error ?? {}) as { code?: unknown; keyPattern?: unknown };
  return (
    code === DUPLICATE_KEY_CODE &&
    typeof keyPattern === "object" &&
    keyPattern !== null &&
    field in keyPattern
  );
}

/** 400 with an error on `field` (the request's password field) unless the password passes the policy. */
export async function assertPasswordAllowed(
  config: Config,
  password: string,
  email: string,
  field = "password",
) {
  const result = await checkPassword(password, { email }, { hibpEnabled: config.HIBP_ENABLED });
  if (!result.ok) throw new ValidationError({ [field]: PASSWORD_PROBLEM_MESSAGES[result.reason] });
}

export async function sendVerificationEmail(
  deps: AuthDeps,
  log: MailFailureLog,
  user: { id: string; email: string },
): Promise<void> {
  const token = await createToken(user.id, "verify_email", VERIFY_TTL_MS);
  const content = emails.verifyEmail(appLink(deps.config, "/verify-email", token));
  await sendSafely(deps.mailer, { to: user.email, ...content }, log, "verify_email");
}

/** Tells the owner of an existing account that someone tried to sign up with their address. */
async function warnExistingAccount(deps: AuthDeps, log: MailFailureLog, email: string) {
  const content = emails.signupAttemptExistingAccount(
    appLink(deps.config, "/signin"),
    appLink(deps.config, "/forgot-password"),
  );
  await sendSafely(deps.mailer, { to: email, ...content }, log, "signup_existing_account");
}

const slugSuffix = () => randomInt(SLUG_SUFFIX_SPACE).toString(36).padStart(6, "0");

/**
 * The employer's company. Always starts unverified: the email isn't confirmed yet, so a domain
 * match proves nothing until `verifyEmail` (anyone can type someone else's work address).
 */
async function createCompany(
  ownerId: Types.ObjectId,
  { name, website, linkedinUrl }: CompanyInput,
) {
  const create = () =>
    Company.create({
      ownerId,
      name,
      slug: slugify(name, slugSuffix()),
      website,
      linkedinUrl,
      verification: "unverified",
    });
  try {
    return await create();
  } catch (error) {
    // A random suffix collision is unlikely; one retry with a new suffix settles it.
    if (!isDuplicateKey(error, "slug")) throw error;
    return create();
  }
}

async function createRoleProfile(userId: Types.ObjectId, input: Signup) {
  if (input.role === "student") {
    const { school, major, gradYear, targetRole, industry, state } = input;
    await StudentProfile.create({ userId, school, major, gradYear, targetRole, industry, state });
    return;
  }
  const company = await createCompany(userId, input.company);
  await EmployerProfile.create({ userId, jobTitle: input.jobTitle, companyId: company._id });
}

/** Undoes a half-finished signup so the address can be used again. */
async function removeAccount(userId: Types.ObjectId): Promise<void> {
  await Promise.all([
    StudentProfile.deleteMany({ userId }),
    EmployerProfile.deleteMany({ userId }),
    Company.deleteMany({ ownerId: userId }),
    AuthToken.deleteMany({ userId }),
  ]);
  await User.deleteOne({ _id: userId });
}

/**
 * Creates the account (user, role profile, company for employers) and emails a verification
 * link. Does not sign in. An address that already has an account gets a warning email instead,
 * and the caller sees exactly the same result, so signup can't be used to test for accounts.
 */
export async function signUp(deps: AuthDeps, log: MailFailureLog, input: Signup): Promise<void> {
  await assertPasswordAllowed(deps.config, input.password, input.email);
  // Hashed before the existence check so both paths cost about the same.
  const passwordHash = await hashPassword(input.password);
  if (await User.exists({ email: input.email })) {
    await warnExistingAccount(deps, log, input.email);
    return;
  }

  let user;
  try {
    user = await User.create({
      email: input.email,
      passwordHash,
      role: input.role,
      name: { first: input.firstName, last: input.lastName },
      ageConfirmedAt: input.role === "student" ? new Date() : undefined,
    });
  } catch (error) {
    // Lost a race with a concurrent signup for the same address.
    if (!isDuplicateKey(error, "email")) throw error;
    await warnExistingAccount(deps, log, input.email);
    return;
  }

  try {
    await createRoleProfile(user._id, input);
    // A deleted account's practice count for this month, held under its email, comes back.
    if (input.role === "student") {
      await restoreLedger(deps.config, user._id, user.email, new Date());
    }
  } catch (error) {
    await removeAccount(user._id);
    throw error;
  }
  await sendVerificationEmail(deps, log, { id: user.id, email: user.email });
}

/**
 * Now that the employer has proved they own their address, verifies their company if the email
 * shares a registrable domain with its website, and records that domain as the one the badge
 * vouches for. Only `unverified` companies without a `verificationLockedReason` are promoted: a
 * company that lost the badge by a rename or domain move waits for an admin, a suspended company
 * stays suspended, and nothing is ever downgraded here.
 */
async function verifyOwnedCompany(userId: string, email: string): Promise<void> {
  const company = await Company.findOne({ ownerId: userId })
    .select("website verification verificationLockedReason")
    .lean();
  if (company?.verification !== "unverified" || company.verificationLockedReason) return;
  const emailDomain = email.slice(email.lastIndexOf("@") + 1);
  if (verificationForCompany(emailDomain, company.website) !== "verified") return;
  await Company.updateOne(
    { _id: company._id, verification: "unverified", verificationLockedReason: null },
    { $set: { verification: "verified", verifiedDomain: registrableDomain(company.website) } },
  );
}

/** Marks the token's user verified (and, for employers, checks their company). Works once. */
export async function verifyEmail(token: string): Promise<void> {
  const userId = await consumeToken(token, "verify_email");
  await User.updateOne(
    { _id: userId, emailVerifiedAt: null },
    { $set: { emailVerifiedAt: new Date() } },
  );
  const user = await User.findById(userId).select("email role").lean();
  if (user?.role === "employer") await verifyOwnedCompany(userId, user.email);
}

/** Sends a new link (retiring the old one) unless the user is already verified. */
export async function resendVerification(
  deps: AuthDeps,
  log: MailFailureLog,
  userId: string,
): Promise<void> {
  const user = await User.findById(userId).select("email emailVerifiedAt").lean();
  if (!user || user.emailVerifiedAt) return;
  await sendVerificationEmail(deps, log, { id: userId, email: user.email });
}

/**
 * Checks credentials. Unknown emails and wrong passwords fail identically, and an unknown email
 * still runs one argon2 verification so the two take about the same time. Only mapped views
 * leave this function; the stored document (and its hash) never does.
 */
export async function signIn({
  email,
  password,
}: Signin): Promise<{ user: PublicUser; identity: SessionIdentity }> {
  const user = await User.findOne({ email }).select("+passwordHash").lean();
  if (!user) {
    await verifyAgainstDummy(password);
    throw new InvalidCredentialsError();
  }
  if (!(await verifyPassword(user.passwordHash, password))) throw new InvalidCredentialsError();
  return {
    user: toPublicUser(user),
    identity: {
      userId: user._id.toString(),
      role: user.role,
      // Users stored before the field existed have no value; they count as version 0.
      sessionVersion: user.sessionVersion ?? 0,
    },
  };
}

/** The signed-in user with their role profile and, for employers, their company. */
export async function getMe(userId: string): Promise<AuthMe> {
  const user = await User.findById(userId).lean();
  if (!user) throw new UnauthenticatedError();
  if (user.role === "student") {
    const profile = await StudentProfile.findOne({ userId }).lean();
    if (!profile) throw new Error("student profile missing");
    return { user: toPublicUser(user), profile: toStudentProfileView(profile) };
  }
  const profile = await EmployerProfile.findOne({ userId }).lean();
  const company = profile && (await Company.findById(profile.companyId).lean());
  if (!profile || !company) throw new Error("employer profile or company missing");
  return {
    user: toPublicUser(user),
    profile: toEmployerProfileView(profile),
    company: toPublicCompany(company),
  };
}

/**
 * Starts a reset for `email` if it has an account. Only the lookup is awaited; issuing the token
 * and sending the email run afterwards, so known and unknown emails answer in about the same time.
 */
export async function requestPasswordReset(
  deps: AuthDeps,
  log: MailFailureLog,
  email: string,
): Promise<void> {
  const user = await User.findOne({ email }).select("_id email").lean();
  if (!user) return;
  const send = async () => {
    const token = await createToken(user._id.toString(), "reset_password", RESET_TTL_MS);
    const content = emails.resetPassword(appLink(deps.config, "/reset-password", token));
    await sendSafely(deps.mailer, { to: user.email, ...content }, log, "reset_password");
  };
  send().catch(() => {
    log.error({ emailKind: "reset_password" }, "password reset could not be started");
  });
}

/**
 * Tells the owner of `email`, if it has an account, that sign-ins to it are being refused after
 * too many wrong passwords, with a link to reset the password. Nothing is awaited: the 429 is sent
 * at once for known and unknown emails alike, and a failure is only logged.
 */
export function warnSigninLimited(deps: AuthDeps, log: MailFailureLog, email: string): void {
  if (!email) return;
  const send = async () => {
    const user = await User.findOne({ email }).select("_id email").lean();
    if (!user) return;
    const token = await createToken(user._id.toString(), "reset_password", RESET_TTL_MS);
    const content = emails.signinLimited(appLink(deps.config, "/reset-password", token));
    await sendSafely(deps.mailer, { to: user.email, ...content }, log, "signin_limited");
  };
  send().catch(() => {
    log.error({ emailKind: "signin_limited" }, "sign-in warning could not be sent");
  });
}

/** Ends every session of the user (they check the version on each request); returns the new one. */
export async function bumpSessionVersion(userId: string): Promise<number> {
  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { sessionVersion: 1 } },
    { returnDocument: "after", projection: { sessionVersion: 1 } },
  ).lean();
  if (!user) throw new UnauthenticatedError();
  return user.sessionVersion ?? 0;
}

/**
 * Sets a new password from a reset link and signs the user out everywhere. The token is only used
 * up once the new password passes the policy, so a rejected password doesn't burn the link.
 * Returns the account's email, so the browser that reset it can be remembered.
 */
export async function resetPassword(
  deps: AuthDeps,
  { token, password }: ResetPassword,
): Promise<{ email: string }> {
  const userId = await peekToken(token, "reset_password");
  const user = await User.findById(userId).select("email").lean();
  if (!user) throw invalidTokenError();
  await assertPasswordAllowed(deps.config, password, user.email);
  const passwordHash = await hashPassword(password);

  await consumeToken(token, "reset_password");
  // One write: the new password and the revocation of every session land together.
  await User.updateOne({ _id: userId }, { $set: { passwordHash }, $inc: { sessionVersion: 1 } });
  await AuthToken.deleteMany({ userId, type: "reset_password", usedAt: null });
  return { email: user.email };
}
